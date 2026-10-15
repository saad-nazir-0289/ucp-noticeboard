using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

/// <summary>The page WhatsApp and others read to build a shared link's preview.</summary>
public class SharePreviewTests : IClassFixture<ApiFactory>
{
    private const string Pwa = "https://ucp-noticeboard.msndev.workers.dev";
    private readonly ApiFactory _api;

    public SharePreviewTests(ApiFactory api) => _api = api;

    private async Task<string> PreviewOf(CreateNoticeRequest request)
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var created = await client.PostAsJsonAsync("/notices", request);
        var notice = (await created.Content.ReadFromJsonAsync<NoticeDto>())!;
        using var anonymous = _api.CreateApiClient(); // link-preview bots carry no login
        return await anonymous.GetStringAsync($"/share/notice/{notice.Id}");
    }

    [Fact]
    public async Task PosterIsSentAsAModestJpeg()
    {
        var html = await PreviewOf(new CreateNoticeRequest("Spring Hackathon", "Teams of 2-4.",
            "https://res.cloudinary.com/demo/image/upload/v1/posters/hack.png", null, null, null, "1111"));

        Assert.Contains("og:image\" content=\"https://res.cloudinary.com/demo/image/upload/w_1200,c_limit,q_auto,f_jpg/v1/posters/hack.png\"", html);
        Assert.Contains("og:site_name\" content=\"UCP NoticeBoard\"", html);
        Assert.Contains("og:title\" content=\"Spring Hackathon\"", html);
    }

    [Fact]
    public async Task NoticeWithoutPoster_GetsNoticeBoardsPreviewCard()
    {
        var html = await PreviewOf(new CreateNoticeRequest("Library closed Friday", "Maintenance.", null, null, null, null, "1111"));

        Assert.Contains($"og:image\" content=\"{Pwa}/og-image.jpg\"", html);
        Assert.Contains("summary_large_image", html);
    }

    [Fact]
    public async Task PreviewSaysWhenItsDueAndWhoPostedIt_InPakistanTime()
    {
        // The details themselves travel in the shared message, not the card.
        var html = await PreviewOf(new CreateNoticeRequest("Fee deadline", "Pay at the bank.", null, null, null,
            new DateTime(2026, 11, 20, 13, 0, 0, DateTimeKind.Utc), "1111"));

        // (The page writes "·" as an HTML entity; the apps show it as "·".)
        Assert.Contains("og:description\" content=\"Deadline: Fri, 20 Nov 2026, 6:00 PM · Test Publisher\"", System.Net.WebUtility.HtmlDecode(html));
    }

    [Fact]
    public async Task WithoutADeadline_PreviewNamesWhoPostedIt()
    {
        var html = await PreviewOf(new CreateNoticeRequest("Library hours", "Open late.", null, null, null, null, "1111"));

        Assert.Contains("og:description\" content=\"Test Publisher\"", html);
    }

    [Fact]
    public async Task TitlesAreEncoded()
    {
        var html = await PreviewOf(new CreateNoticeRequest("<script>alert(1)</script> & more", "x", null, null, null, null, "1111"));

        Assert.DoesNotContain("<script>alert", html);
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more", html);
    }
}
