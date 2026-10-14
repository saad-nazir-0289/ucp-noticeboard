using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>Per-account PIN lockout, salted PIN hashes, and unlocked devices.</summary>
public class PinSecurityTests : IClassFixture<ApiFactory>
{
    private const string Pin = "1111";
    private const string WrongPin = "2222";

    private readonly ApiFactory _api;

    public PinSecurityTests(ApiFactory api) => _api = api;

    private static CreateNoticeRequest Notice(string? pin) => new("Test", "Body", null, null, null, null, pin!);

    private static Task<HttpResponseMessage> Post(HttpClient client, string? pin) => client.PostAsJsonAsync("/notices", Notice(pin));

    /// <summary>A Publisher whose PIN is already set to <see cref="Pin"/>.</summary>
    private async Task<(LoginResponse Publisher, HttpClient Client)> PublisherWithPinAsync()
    {
        var publisher = await _api.CreatePublisherAsync();
        var client = _api.CreateApiClient(publisher.Token);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, Pin)).StatusCode);
        return (publisher, client);
    }

    private async Task LockAsync(HttpClient client)
    {
        for (var i = 1; i < PinService.AttemptsBeforeLock; i++)
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, WrongPin)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(client, WrongPin)).StatusCode);
    }

    private async Task<string> UnlockDeviceAsync(HttpClient client, string pin = Pin)
    {
        var response = await client.PostAsJsonAsync("/auth/unlock", new UnlockDeviceRequest(pin, "Test phone"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<UnlockDeviceResponse>())!.DeviceToken;
    }

    private HttpClient DeviceClient(LoginResponse user, string deviceToken)
    {
        var client = _api.CreateApiClient(user.Token);
        client.DefaultRequestHeaders.Add(PinService.DeviceTokenHeader, deviceToken);
        return client;
    }

    // --- Lockout ---

    [Fact]
    public async Task FiveWrongPins_LockTheAccount_EvenAgainstTheRightPin()
    {
        var (_, client) = await PublisherWithPinAsync();

        var first = await Post(client, WrongPin);
        Assert.Contains("4 tries left", await first.Content.ReadAsStringAsync());
        for (var i = 2; i < PinService.AttemptsBeforeLock; i++) await Post(client, WrongPin);
        var fifth = await Post(client, WrongPin);
        var rightPinWhileLocked = await Post(client, Pin);

        Assert.Equal(HttpStatusCode.TooManyRequests, fifth.StatusCode);
        Assert.Contains("locked", await fifth.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.TooManyRequests, rightPinWhileLocked.StatusCode);
    }

    [Fact]
    public async Task Lock_ExpiresAfter15Minutes_ThenDoublesIfGuessingContinues()
    {
        var (_, client) = await PublisherWithPinAsync();
        await LockAsync(client);

        _api.Clock.Advance(TimeSpan.FromMinutes(16));
        await LockAsync(client); // five more wrong ones without a success in between

        _api.Clock.Advance(TimeSpan.FromMinutes(16));
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Post(client, Pin)).StatusCode); // 30 minutes this time

        _api.Clock.Advance(TimeSpan.FromMinutes(15));
        Assert.Equal(HttpStatusCode.Created, (await Post(client, Pin)).StatusCode);
    }

    [Fact]
    public async Task CorrectPin_ResetsTheWrongPinCount()
    {
        var (_, client) = await PublisherWithPinAsync();

        for (var i = 1; i < PinService.AttemptsBeforeLock; i++) await Post(client, WrongPin);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, Pin)).StatusCode);

        var afterReset = await Post(client, WrongPin);
        Assert.Equal(HttpStatusCode.BadRequest, afterReset.StatusCode);
        Assert.Contains("4 tries left", await afterReset.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AdminPinReset_LiftsALock()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        await LockAsync(client);

        using var admin = _api.CreateApiClient((await _api.GetAdminAsync()).Token);
        var reset = await admin.PostAsync($"/users/{publisher.Id}/reset-pin?adminPin={ApiFactory.AdminPin}", null);

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "5555")).StatusCode); // sets a new PIN
    }

    // --- Hashing ---

    [Fact]
    public void PinHashes_AreSalted()
    {
        var a = PinHasher.Hash(Pin);
        var b = PinHasher.Hash(Pin);

        Assert.NotEqual(a, b);
        Assert.True(PinHasher.Verify(Pin, a));
        Assert.False(PinHasher.Verify(WrongPin, a));
    }

    [Fact]
    public async Task LegacyUnsaltedHash_StillWorks_AndIsUpgradedOnUse()
    {
        var publisher = await _api.CreatePublisherAsync();
        using (var scope = _api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.FindAsync(publisher.Id);
            // Exactly what the old code stored: unsalted SHA-256 hex.
            user!.PinHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(Pin)));
            await db.SaveChangesAsync();
        }
        using var client = _api.CreateApiClient(publisher.Token);

        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, WrongPin)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, Pin)).StatusCode);

        using var check = _api.Services.CreateScope();
        var stored = (await check.ServiceProvider.GetRequiredService<AppDbContext>().Users.AsNoTracking()
            .FirstAsync(u => u.Id == publisher.Id)).PinHash!;
        Assert.StartsWith("pbkdf2-sha256$", stored);
    }

    // --- Unlocked devices ---

    [Fact]
    public async Task UnlockedDevice_PublishesWithoutAPin()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);

        using var device = DeviceClient(publisher, token);

        Assert.Equal(HttpStatusCode.Created, (await Post(device, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, null)).StatusCode); // no token, no PIN
    }

    [Fact]
    public async Task UnlockedDevice_KeepsWorkingWhileTheAccountIsLocked()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);

        await LockAsync(client); // e.g. someone else guessing with the Roll Number

        using var device = DeviceClient(publisher, token);
        Assert.Equal(HttpStatusCode.Created, (await Post(device, null)).StatusCode);
        // ...but a new device can't be unlocked until the lock ends.
        var unlock = await client.PostAsJsonAsync("/auth/unlock", new UnlockDeviceRequest(Pin, null));
        Assert.Equal(HttpStatusCode.TooManyRequests, unlock.StatusCode);
    }

    [Fact]
    public async Task UnlockNeedsThePin_NotAnotherDevice()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);

        using var device = DeviceClient(publisher, token);
        var response = await device.PostAsJsonAsync("/auth/unlock", new UnlockDeviceRequest(null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Students_CannotUnlockDevices()
    {
        var student = await _api.LoginStudentAsync();
        using var client = _api.CreateApiClient(student.Token);

        var response = await client.PostAsJsonAsync("/auth/unlock", new UnlockDeviceRequest(Pin, null));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task UnlockedDevice_ExpiresAfter30DaysUnused_ButStaysAliveWhileUsed()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);
        using var device = DeviceClient(publisher, token);

        _api.Clock.Advance(TimeSpan.FromDays(20));
        Assert.Equal(HttpStatusCode.Created, (await Post(device, null)).StatusCode); // use extends it
        _api.Clock.Advance(TimeSpan.FromDays(20));
        Assert.Equal(HttpStatusCode.Created, (await Post(device, null)).StatusCode);
        _api.Clock.Advance(TimeSpan.FromDays(31));
        var expired = await Post(device, null);

        Assert.Equal(HttpStatusCode.BadRequest, expired.StatusCode);
        Assert.Equal("invalid", expired.Headers.GetValues(PinService.DeviceTokenStatusHeader).Single());
    }

    [Fact]
    public async Task RoleChange_LogsDevicesOut()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);

        using var admin = _api.CreateApiClient((await _api.GetAdminAsync()).Token);
        await admin.PatchAsJsonAsync($"/users/{publisher.Id}/role", new UpdateUserRoleRequest("Student", ApiFactory.AdminPin));
        await admin.PatchAsJsonAsync($"/users/{publisher.Id}/role", new UpdateUserRoleRequest("Publisher", ApiFactory.AdminPin));

        var fresh = await _api.LoginAsync(publisher.RollNumber); // new token after the role changes
        using var device = DeviceClient(fresh, token);
        var response = await Post(device, null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid", response.Headers.GetValues(PinService.DeviceTokenStatusHeader).Single());
    }

    [Fact]
    public async Task Admin_CanLogOutAUsersDevices_AndSeesThemInTheUserList()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var token = await UnlockDeviceAsync(client);
        using var admin = _api.CreateApiClient((await _api.GetAdminAsync()).Token);
        admin.DefaultRequestHeaders.Add("X-Admin-Pin", ApiFactory.AdminPin);

        var before = (await admin.GetFromJsonAsync<PagedResult<UserDto>>($"/users?search={publisher.RollNumber}"))!.Items.Single(u => u.Id == publisher.Id);
        var revoke = await admin.DeleteAsync($"/users/{publisher.Id}/devices");
        var after = (await admin.GetFromJsonAsync<PagedResult<UserDto>>($"/users?search={publisher.RollNumber}"))!.Items.Single(u => u.Id == publisher.Id);
        using var device = DeviceClient(publisher, token);

        Assert.Equal(1, before.ActiveDevices);
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        Assert.Equal(0, after.ActiveDevices);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(device, null)).StatusCode);
    }

    [Fact]
    public async Task UserList_ShowsLockedAccounts()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        await LockAsync(client);
        using var admin = _api.CreateApiClient((await _api.GetAdminAsync()).Token);
        admin.DefaultRequestHeaders.Add("X-Admin-Pin", ApiFactory.AdminPin);

        var users = await admin.GetFromJsonAsync<PagedResult<UserDto>>($"/users?search={publisher.RollNumber}");

        Assert.True(users!.Items.Single(u => u.Id == publisher.Id).PinLocked);
    }

    [Fact]
    public async Task Users_CanListAndLogOutTheirOwnDevices()
    {
        var (publisher, client) = await PublisherWithPinAsync();
        var phone = await UnlockDeviceAsync(client);
        await UnlockDeviceAsync(client); // a second device
        using var device = DeviceClient(publisher, phone);

        var devices = await device.GetFromJsonAsync<List<DeviceSessionDto>>("/auth/devices");
        var current = devices!.Single(d => d.IsCurrent);
        var logOut = await device.DeleteAsync($"/auth/devices/{current.Id}");
        var remaining = await client.GetFromJsonAsync<List<DeviceSessionDto>>("/auth/devices");

        Assert.Equal(2, devices.Count);
        Assert.Equal("Test phone", current.Label);
        Assert.Equal(HttpStatusCode.NoContent, logOut.StatusCode);
        Assert.Single(remaining!);
    }
}
