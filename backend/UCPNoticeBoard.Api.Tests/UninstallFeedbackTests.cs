using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>The anonymous answers from the page shown after the extension is removed.</summary>
public class UninstallFeedbackTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public UninstallFeedbackTests(ApiFactory api) => _api = api;

    private async Task<AnalyticsSummaryDto> SummaryAsync()
    {
        var admin = await _api.GetAdminAsync();
        using var client = _api.CreateApiClient(admin.Token);
        var request = new HttpRequestMessage(HttpMethod.Get, "/analytics/summary");
        request.Headers.Add("X-Admin-Pin", ApiFactory.AdminPin);
        return (await (await client.SendAsync(request)).Content.ReadFromJsonAsync<AnalyticsSummaryDto>())!;
    }

    [Fact]
    public async Task Answer_NeedsNoSignIn_AndShowsInTheAdminSummary()
    {
        using var anonymous = _api.CreateApiClient();
        var comment = $"Too slow on campus {Guid.NewGuid():N}";
        var response = await anonymous.PostAsJsonAsync("/feedback/uninstall", new UninstallFeedbackRequest("slow", comment, "1.22.0"));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var summary = await SummaryAsync();
        Assert.Contains(summary.UninstallReasons, r => r.Reason == "slow" && r.Count >= 1);
        var written = Assert.Single(summary.UninstallComments, c => c.Comment == comment);
        Assert.Equal("1.22.0", written.ExtensionVersion);
    }

    [Fact]
    public async Task UnknownReason_IsRejected()
    {
        using var anonymous = _api.CreateApiClient();
        var response = await anonymous.PostAsJsonAsync("/feedback/uninstall", new UninstallFeedbackRequest("hacked", null, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task LongComment_IsCut_ToTheLimit()
    {
        using var anonymous = _api.CreateApiClient();
        var marker = Guid.NewGuid().ToString("N");
        var comment = marker + new string('x', 2000);
        await anonymous.PostAsJsonAsync("/feedback/uninstall", new UninstallFeedbackRequest("other", comment, null));

        var summary = await SummaryAsync();
        var stored = Assert.Single(summary.UninstallComments, c => c.Comment.StartsWith(marker));
        Assert.Equal(UninstallFeedback.CommentMaxLength, stored.Comment.Length);
    }
}
