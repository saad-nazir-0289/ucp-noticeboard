using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>Deleting moves a notice to the bin; it can be restored for 30 days.</summary>
public class NoticeBinTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public NoticeBinTests(ApiFactory api) => _api = api;

    private static async Task<NoticeDto> Post(HttpClient client, string pin, string title) =>
        (await (await client.PostAsJsonAsync("/notices", new CreateNoticeRequest(title, "Details", null, null, null, null, pin)))
            .Content.ReadFromJsonAsync<NoticeDto>())!;

    private static async Task<List<NoticeDto>> Everything(HttpClient client) =>
        (await client.GetFromJsonAsync<List<NoticeDto>>("/notices?includeDismissed=true&includeExpired=true"))!;

    [Fact]
    public async Task DeletedNotice_GoesToTheBin_AndCanBeRestored()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var notice = await Post(client, "1111", $"Bin {Guid.NewGuid():N}");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/notices/{notice.Id}?pin=1111")).StatusCode);
        Assert.DoesNotContain(await Everything(client), n => n.Id == notice.Id);

        var bin = (await client.GetFromJsonAsync<List<BinNoticeDto>>("/notices/bin"))!;
        var binned = Assert.Single(bin, n => n.Id == notice.Id);
        Assert.Equal(publisher.Name, binned.DeletedByName);
        Assert.True(binned.PurgeAt > DateTime.UtcNow.AddDays(29));

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/notices/{notice.Id}/restore?pin=2222", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/notices/{notice.Id}/restore?pin=1111", null)).StatusCode);

        var back = Assert.Single(await Everything(client), n => n.Id == notice.Id);
        Assert.Equal(notice.Title, back.Title);
        // The database keeps microseconds, .NET finer ticks: equal to the millisecond.
        Assert.Equal(notice.CreatedAt, back.CreatedAt, TimeSpan.FromMilliseconds(1));
        Assert.DoesNotContain((await client.GetFromJsonAsync<List<BinNoticeDto>>("/notices/bin"))!, n => n.Id == notice.Id);
    }

    [Fact]
    public async Task BatchDelete_AlsoGoesToTheBin()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var a = await Post(client, "1111", "Batch bin A");
        var b = await Post(client, "1111", "Batch bin B");

        await client.PostAsJsonAsync("/notices/delete", new DeleteNoticesRequest(new List<int> { a.Id, b.Id }, "1111"));

        var bin = (await client.GetFromJsonAsync<List<BinNoticeDto>>("/notices/bin"))!;
        Assert.Contains(bin, n => n.Id == a.Id);
        Assert.Contains(bin, n => n.Id == b.Id);
    }

    [Fact]
    public async Task Publishers_SeeOnlyTheirOwnBin_TheAdminSeesEveryone()
    {
        var owner = await _api.CreatePublisherAsync();
        var other = await _api.CreatePublisherAsync();
        using var ownerClient = _api.CreateApiClient(owner.Token);
        using var otherClient = _api.CreateApiClient(other.Token);
        var notice = await Post(ownerClient, "1111", "Owner's notice");
        await ownerClient.DeleteAsync($"/notices/{notice.Id}?pin=1111");

        Assert.DoesNotContain((await otherClient.GetFromJsonAsync<List<BinNoticeDto>>("/notices/bin"))!, n => n.Id == notice.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherClient.PostAsync($"/notices/{notice.Id}/restore?pin=2222", null)).StatusCode);

        var admin = await _api.GetAdminAsync();
        using var adminClient = _api.CreateApiClient(admin.Token);
        Assert.Contains((await adminClient.GetFromJsonAsync<List<BinNoticeDto>>("/notices/bin"))!, n => n.Id == notice.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await adminClient.PostAsync($"/notices/{notice.Id}/restore?pin={ApiFactory.AdminPin}", null)).StatusCode);
    }

    [Fact]
    public async Task RenamingAPublisher_KeepsTheirNotices()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var notice = await Post(client, "1111", "Before the rename");

        var admin = await _api.GetAdminAsync();
        using var adminClient = _api.CreateApiClient(admin.Token);
        var renamed = await adminClient.PatchAsJsonAsync($"/users/{publisher.Id}/name", new UpdateUserNameRequest("NoticeBoard Team", ApiFactory.AdminPin));
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);

        var after = Assert.Single(await Everything(adminClient), n => n.Id == notice.Id);
        Assert.Equal("NoticeBoard Team", after.CreatedByName);
    }
}
