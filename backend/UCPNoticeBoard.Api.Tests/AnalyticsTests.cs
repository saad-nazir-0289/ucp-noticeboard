using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>
/// The Admin's Analytics: visits counted per day and per place (the
/// extension or the web app), each person once a day, notice opens, and
/// the summary over a chosen range. Only totals are kept.
/// </summary>
public class AnalyticsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public AnalyticsTests(ApiFactory api) => _api = api;

    private async Task<AnalyticsSummaryDto> SummaryAsync(int? days = null)
    {
        var admin = await _api.GetAdminAsync();
        using var client = _api.CreateApiClient(admin.Token);
        var request = new HttpRequestMessage(HttpMethod.Get, days is null ? "/analytics/summary" : $"/analytics/summary?days={days}");
        request.Headers.Add("X-Admin-Pin", ApiFactory.AdminPin);
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AnalyticsSummaryDto>())!;
    }

    private async Task VisitAsync(string token, string? source)
    {
        using var client = _api.CreateApiClient(token);
        var response = await client.PostAsync(source is null ? "/analytics/visit" : $"/analytics/visit?source={source}", null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Visits_CountEveryOpen_ButEachPersonOncePerDay_AndByPlace()
    {
        var before = (await SummaryAsync()).Days[^1];
        var student = await _api.LoginStudentAsync();

        await VisitAsync(student.Token, "extension");
        await VisitAsync(student.Token, "extension");
        await VisitAsync(student.Token, "app");
        await VisitAsync(student.Token, null); // an older copy that doesn't say where

        var summary = await SummaryAsync();
        var today = summary.Days[^1];
        Assert.Equal(before.Visits + 4, today.Visits);
        Assert.Equal(before.Visitors + 1, today.Visitors);
        Assert.Equal(before.VisitorsExtension + 1, today.VisitorsExtension);
        Assert.Equal(before.VisitorsApp + 1, today.VisitorsApp);
        Assert.True(summary.Audience.Both >= 1);
        Assert.True(summary.VisitsByHour.Sum() >= 4);
        Assert.NotNull(summary.TrackingSince);
    }

    [Fact]
    public async Task NoticeOpens_AreCountedForTheDay()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var publisherClient = _api.CreateApiClient(publisher.Token);
        var created = await publisherClient.PostAsJsonAsync("/notices", new CreateNoticeRequest("Career fair", "Hall A", null, null, null, null, "4321"));
        var notice = (await created.Content.ReadFromJsonAsync<NoticeDto>())!;
        var before = (await SummaryAsync()).Days[^1];

        var student = await _api.LoginStudentAsync();
        using var studentClient = _api.CreateApiClient(student.Token);
        Assert.Equal(HttpStatusCode.NoContent, (await studentClient.PostAsync($"/notices/{notice.Id}/view", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await studentClient.GetAsync($"/notices/{notice.Id}")).StatusCode);

        var summary = await SummaryAsync();
        Assert.Equal(before.Opens + 2, summary.Days[^1].Opens);
        Assert.True(summary.Days[^1].NoticesPosted >= 1);
        Assert.True(summary.Notices.PostedInRange >= 1);
        Assert.Contains(summary.TopNotices, n => n.Id == notice.Id && n.ViewCount == 2);
    }

    [Theory]
    [InlineData(7, 7)]
    [InlineData(30, 30)]
    [InlineData(90, 90)]
    [InlineData(12, 30)] // anything else: 30 days
    public async Task Summary_CoversTheChosenRange(int asked, int expected)
    {
        var summary = await SummaryAsync(asked);
        Assert.Equal(expected, summary.RangeDays);
        Assert.Equal(expected, summary.Days.Count);
        Assert.Equal(24, summary.VisitsByHour.Count);
        Assert.True(summary.Days[0].Day < summary.Days[^1].Day);
        Assert.NotEmpty(summary.Categories);
    }

    [Fact]
    public async Task NewPeople_AreCountedOnTheDayTheyJoined()
    {
        var before = await SummaryAsync(7);
        await _api.LoginStudentAsync();
        var after = await SummaryAsync(7);
        Assert.Equal(before.Days[^1].NewUsers + 1, after.Days[^1].NewUsers);
        Assert.Equal(before.Current.NewUsers + 1, after.Current.NewUsers);
        Assert.Equal(before.Audience.NeverOpened + 1, after.Audience.NeverOpened);
    }
}
