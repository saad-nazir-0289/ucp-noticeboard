using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>
/// Knowing the Admin's Roll Number yields an Admin token, so every Admin
/// endpoint must also demand the Admin's PIN — the token alone is not
/// enough to read user data or change anything.
/// </summary>
public class AdminPinTests : IClassFixture<ApiFactory>
{
    private const string WrongPin = "9999";

    private readonly ApiFactory _api;

    public AdminPinTests(ApiFactory api) => _api = api;

    private async Task<HttpClient> AdminClientAsync()
    {
        var admin = await _api.GetAdminAsync();
        var client = _api.CreateApiClient(admin.Token);

        // Make sure the Admin's PIN is set (the first PIN used becomes it).
        var setPin = await client.PostAsJsonAsync("/users", new AddUserRequest(RollNumbers.Next(), "Someone", ApiFactory.AdminPin));
        Assert.Equal(HttpStatusCode.OK, setPin.StatusCode);
        return client;
    }

    private static HttpRequestMessage Get(string path, string? pin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (pin is not null) request.Headers.Add("X-Admin-Pin", pin);
        return request;
    }

    [Theory]
    [InlineData("/users")]
    [InlineData("/analytics/summary")]
    public async Task AdminReads_RequireCorrectPin(string path)
    {
        using var client = await AdminClientAsync();

        var noPin = await client.SendAsync(Get(path, null));
        var wrongPin = await client.SendAsync(Get(path, WrongPin));
        var rightPin = await client.SendAsync(Get(path, ApiFactory.AdminPin));

        Assert.Equal(HttpStatusCode.BadRequest, noPin.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, wrongPin.StatusCode);
        Assert.Equal(HttpStatusCode.OK, rightPin.StatusCode);
    }

    [Fact]
    public async Task RenameUser_RequiresCorrectPin()
    {
        using var client = await AdminClientAsync();
        var target = await _api.LoginAsync(RollNumbers.Next(), "Original Name");

        var noPin = await client.PatchAsJsonAsync($"/users/{target.Id}/name", new UpdateUserNameRequest("Renamed", null));
        var wrongPin = await client.PatchAsJsonAsync($"/users/{target.Id}/name", new UpdateUserNameRequest("Renamed", WrongPin));
        var unchanged = await _api.LoginAsync(target.RollNumber);
        var rightPin = await client.PatchAsJsonAsync($"/users/{target.Id}/name", new UpdateUserNameRequest("Renamed", ApiFactory.AdminPin));
        var renamed = await _api.LoginAsync(target.RollNumber);

        Assert.Equal(HttpStatusCode.BadRequest, noPin.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, wrongPin.StatusCode);
        Assert.Equal("Original Name", unchanged.Name);
        Assert.Equal(HttpStatusCode.OK, rightPin.StatusCode);
        Assert.Equal("Renamed", renamed.Name);
    }

    [Fact]
    public async Task Categories_CannotBeCreated()
    {
        using var client = await AdminClientAsync();

        var response = await client.PostAsJsonAsync("/categories", new { name = "Anything", pin = ApiFactory.AdminPin });

        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    [Fact]
    public async Task AdminPinRequests_AreRateLimitedPerIp()
    {
        var admin = await _api.GetAdminAsync();
        // Pin the client IP so every guess lands in the same rate-limit bucket.
        using var client = _api.CreateApiClient(admin.Token, clientIp: "203.0.113.7");

        // A malformed PIN is refused without counting toward the account
        // lock, so any 429 here comes from the per-IP limiter.
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 25; i++)
        {
            statuses.Add((await client.SendAsync(Get("/users", "not-a-pin"))).StatusCode);
        }

        Assert.Contains(HttpStatusCode.TooManyRequests, statuses);
    }
}
