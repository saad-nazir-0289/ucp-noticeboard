using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class LogoTests : IClassFixture<ApiFactory>
{
    private const string Logo = "https://res.cloudinary.com/demo/image/upload/society-logo.png";

    private readonly ApiFactory _api;

    public LogoTests(ApiFactory api) => _api = api;

    private async Task<NoticeDto> PublishAsync(HttpClient client, string title)
    {
        var response = await client.PostAsJsonAsync("/notices", new CreateNoticeRequest(title, "Body", null, null, null, null, "1111"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<NoticeDto>())!;
    }

    [Fact]
    public async Task PublisherSetsOwnLogo_AndStudentsSeeItOnTheirNotices()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var notice = await PublishAsync(client, $"With logo {Guid.NewGuid():N}");

        var set = await client.PutAsJsonAsync("/profile/logo", new UpdateLogoRequest(Logo, "1111"));
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);

        var student = await _api.LoginStudentAsync();
        Assert.Equal(Logo, student.Notices.Single(n => n.Id == notice.Id).CreatedByLogoUrl);
        Assert.Equal(Logo, (await _api.LoginAsync(publisher.RollNumber)).LogoUrl);

        var cleared = await client.PutAsJsonAsync("/profile/logo", new UpdateLogoRequest(null, "1111"));
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        var again = await _api.LoginStudentAsync();
        Assert.Null(again.Notices.Single(n => n.Id == notice.Id).CreatedByLogoUrl);
    }

    [Theory]
    [InlineData("http://example.com/logo.png")]
    [InlineData("javascript:alert(1)")]
    [InlineData("not a url")]
    public async Task OnlyHttpsLogosAreAccepted(string logo)
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);

        var response = await client.PutAsJsonAsync("/profile/logo", new UpdateLogoRequest(logo, "1111"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task LogoChangesNeedThePin()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        await PublishAsync(client, "Sets the PIN to 1111");

        var response = await client.PutAsJsonAsync("/profile/logo", new UpdateLogoRequest(Logo, "2222"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task StudentsCannotSetALogo()
    {
        var student = await _api.LoginStudentAsync();
        using var client = _api.CreateApiClient(student.Token);

        var response = await client.PutAsJsonAsync("/profile/logo", new UpdateLogoRequest(Logo, "1111"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminSetsAPublishersLogo()
    {
        var publisher = await _api.CreatePublisherAsync();
        var admin = await _api.GetAdminAsync();
        using var adminClient = _api.CreateApiClient(admin.Token);

        var wrongPin = await adminClient.PutAsJsonAsync($"/users/{publisher.Id}/logo", new UpdateLogoRequest(Logo, "0000"));
        var response = await adminClient.PutAsJsonAsync($"/users/{publisher.Id}/logo", new UpdateLogoRequest(Logo, ApiFactory.AdminPin));

        Assert.NotEqual(HttpStatusCode.OK, wrongPin.StatusCode);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Logo, (await response.Content.ReadFromJsonAsync<UserDto>())!.LogoUrl);
        Assert.Equal(Logo, (await _api.LoginAsync(publisher.RollNumber)).LogoUrl);
    }
}
