using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class PinnedNoticeTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public PinnedNoticeTests(ApiFactory api) => _api = api;

    private static CreateNoticeRequest NewNotice(string title, string pin, bool? pinned = null) =>
        new(title, "Some description", null, null, null, null, pin, pinned);

    private async Task<NoticeDto> CreateAsync(HttpClient client, CreateNoticeRequest request)
    {
        var response = await client.PostAsJsonAsync("/notices", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<NoticeDto>())!;
    }

    [Fact]
    public async Task AdminCanPin_AndPinnedNoticesComeFirst()
    {
        var admin = await _api.GetAdminAsync();
        using var adminClient = _api.CreateApiClient(admin.Token);
        var pinned = await CreateAsync(adminClient, NewNotice($"Pinned {Guid.NewGuid():N}", ApiFactory.AdminPin, pinned: true));
        var newer = await CreateAsync(adminClient, NewNotice($"Newer {Guid.NewGuid():N}", ApiFactory.AdminPin));

        var student = await _api.LoginStudentAsync();
        using var studentClient = _api.CreateApiClient(student.Token);
        var feed = (await studentClient.GetFromJsonAsync<List<NoticeDto>>("/notices"))!;

        Assert.True(pinned.IsPinned);
        Assert.False(newer.IsPinned);
        Assert.Equal(pinned.Id, feed[0].Id);
        Assert.True(feed.FindIndex(n => n.Id == newer.Id) > 0);
    }

    [Fact]
    public async Task PublisherCannotPin()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);

        var created = await CreateAsync(client, NewNotice("Trying to pin", "1111", pinned: true));
        var edited = await client.PutAsJsonAsync($"/notices/{created.Id}",
            new UpdateNoticeRequest("Trying again", "x", null, null, null, null, "1111", true));

        Assert.False(created.IsPinned);
        Assert.False((await edited.Content.ReadFromJsonAsync<NoticeDto>())!.IsPinned);
    }

    [Fact]
    public async Task AdminCanUnpin_AndEditsWithoutTheFlagKeepIt()
    {
        var admin = await _api.GetAdminAsync();
        using var client = _api.CreateApiClient(admin.Token);
        var notice = await CreateAsync(client, NewNotice("Exam schedule", ApiFactory.AdminPin, pinned: true));

        var kept = await client.PutAsJsonAsync($"/notices/{notice.Id}",
            new UpdateNoticeRequest("Exam schedule (updated)", "x", null, null, null, null, ApiFactory.AdminPin));
        var unpinned = await client.PutAsJsonAsync($"/notices/{notice.Id}",
            new UpdateNoticeRequest("Exam schedule (updated)", "x", null, null, null, null, ApiFactory.AdminPin, false));

        Assert.True((await kept.Content.ReadFromJsonAsync<NoticeDto>())!.IsPinned);
        Assert.False((await unpinned.Content.ReadFromJsonAsync<NoticeDto>())!.IsPinned);
    }

    [Fact]
    public async Task PinnedNoticeWithoutDeadline_OutlivesTheSevenDayLimit()
    {
        var admin = await _api.GetAdminAsync();
        using var client = _api.CreateApiClient(admin.Token);
        var pinned = await CreateAsync(client, NewNotice($"Old pinned {Guid.NewGuid():N}", ApiFactory.AdminPin, pinned: true));
        var plain = await CreateAsync(client, NewNotice($"Old plain {Guid.NewGuid():N}", ApiFactory.AdminPin));

        using (var scope = _api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var id in new[] { pinned.Id, plain.Id })
            {
                (await db.Notices.FindAsync(id))!.CreatedAt = DateTime.UtcNow.AddDays(-30);
            }
            await db.SaveChangesAsync();
            scope.ServiceProvider.GetRequiredService<INoticeQueryService>().InvalidateNoticesCache();
        }

        var student = await _api.LoginStudentAsync();
        using var studentClient = _api.CreateApiClient(student.Token);
        var feed = (await studentClient.GetFromJsonAsync<List<NoticeDto>>("/notices"))!;

        Assert.Contains(feed, n => n.Id == pinned.Id);
        Assert.DoesNotContain(feed, n => n.Id == plain.Id);
    }
}
