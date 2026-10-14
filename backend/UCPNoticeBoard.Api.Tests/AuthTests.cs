using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class AuthTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public AuthTests(ApiFactory api) => _api = api;

    [Theory]
    [InlineData("")]
    [InlineData("not-a-roll-number")]
    [InlineData("L1F21BSCS12")]
    public async Task Login_RejectsMalformedRollNumber(string rollNumber)
    {
        using var client = _api.CreateApiClient();

        var response = await client.PostAsJsonAsync("/login", new LoginRequest(rollNumber, "Someone", null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_UnknownRollNumber_CreatesStudentAccount()
    {
        var rollNumber = RollNumbers.Next();

        var user = await _api.LoginAsync(rollNumber.ToLowerInvariant(), "Ali Raza");

        Assert.Equal("Student", user.Role);
        Assert.Equal("Ali Raza", user.Name);
        Assert.Equal(rollNumber, user.RollNumber); // normalized to upper case
        Assert.False(string.IsNullOrEmpty(user.Token));
    }

    [Fact]
    public async Task Login_NeverOverwritesExistingName()
    {
        var rollNumber = RollNumbers.Next();
        await _api.LoginAsync(rollNumber, "Original Name");

        var again = await _api.LoginAsync(rollNumber, "Impostor Name");

        Assert.Equal("Original Name", again.Name);
    }

    [Fact]
    public async Task AdminSecret_OnlyPromotesWhileNoAdminExists()
    {
        await _api.GetAdminAsync(); // asserts the first claim became Admin

        var second = await _api.LoginAsync(RollNumbers.Next(), activationCode: ApiFactory.AdminActivationSecret);

        Assert.Equal("Student", second.Role);
    }

    [Fact]
    public async Task DemotedPublisher_OldTokenIsRejectedImmediately()
    {
        var publisher = await _api.CreatePublisherAsync();
        var admin = await _api.GetAdminAsync();

        using var adminClient = _api.CreateApiClient(admin.Token);
        var demote = await adminClient.PatchAsJsonAsync(
            $"/users/{publisher.Id}/role", new UpdateUserRoleRequest("Student", ApiFactory.AdminPin));
        Assert.Equal(HttpStatusCode.OK, demote.StatusCode);

        using var staleClient = _api.CreateApiClient(publisher.Token);
        var response = await staleClient.GetAsync("/notices");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
