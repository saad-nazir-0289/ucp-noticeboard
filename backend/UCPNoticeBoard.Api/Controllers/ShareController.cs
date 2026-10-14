using System.Net;
using Microsoft.AspNetCore.Mvc;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("share")]
public class ShareController : ControllerBase
{
    private readonly AppDbContext _db;

    // Where a human following a share link ends up. Comes from
    // Pwa:BaseUrl so a staging API redirects into the staging PWA.
    private readonly string _pwaBaseUrl;

    public ShareController(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _pwaBaseUrl = (configuration["Pwa:BaseUrl"] ?? "https://ucp-noticeboard.msndev.workers.dev").TrimEnd('/');
    }

    /// <summary>
    /// Deliberately not [Authorize] — this exists specifically to be
    /// fetched by link-unfurling bots (WhatsApp, iMessage, Slack, etc.),
    /// none of which carry a login token. That's an acceptable exposure
    /// for the same reason GET /notices/{id} already has none either:
    /// notices are public campus content a Publisher already chose to
    /// broadcast to the whole student body, not private data.
    ///
    /// The PWA itself can't serve this directly — it's a client-side
    /// single-page app returning one static index.html for every URL,
    /// which a crawler that doesn't execute JavaScript simply can't see
    /// through. This is a small server-rendered page that exists only to
    /// give those crawlers something real to read — a human clicking the
    /// link is redirected straight into the actual app immediately, and
    /// never sees this page render.
    /// </summary>
    [HttpGet("notice/{id}")]
    public async Task<ContentResult> SharePreview(int id)
    {
        var destinationUrl = $"{_pwaBaseUrl}/?notice={id}";
        var notice = await _db.Notices.FindAsync(id);

        if (notice is null)
        {
            return BuildHtml("UCP NoticeBoard", "This notice is no longer available.", null, destinationUrl);
        }

        var description = notice.Description.Length > 180
            ? notice.Description[..180].TrimEnd() + "…"
            : notice.Description;
        // The deadline first: it's what someone glancing at the preview needs.
        if (notice.Deadline is DateTime deadline)
        {
            description = $"Deadline: {PakistanTime(deadline):ddd, d MMM yyyy, h:mm tt}. {description}";
        }

        return BuildHtml(notice.Title, description, PreviewImage(notice.ImageUrl), destinationUrl);
    }

    /// <summary>Deadlines are stored in UTC; students read them in Pakistan time.</summary>
    private static DateTime PakistanTime(DateTime utc) =>
        DateTime.SpecifyKind(utc, DateTimeKind.Utc).AddHours(5);

    /// <summary>
    /// The picture in a link preview: the poster, as a JPEG no wider than
    /// 1200px (WhatsApp skips large or unusual images), or for notices
    /// without one, NoticeBoard's own preview card.
    /// </summary>
    private string PreviewImage(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl)) return $"{_pwaBaseUrl}/og-image.jpg";
        const string marker = "/upload/";
        var at = imageUrl.IndexOf(marker, StringComparison.Ordinal);
        return imageUrl.Contains("res.cloudinary.com") && at >= 0
            ? imageUrl.Insert(at + marker.Length, "w_1200,c_limit,q_auto,f_jpg/")
            : imageUrl;
    }

    private static ContentResult BuildHtml(string title, string description, string? imageUrl, string destinationUrl)
    {
        // All user-supplied content (title/description come from whatever
        // a Publisher typed) is HTML-encoded before interpolation — this
        // endpoint returns raw HTML, so skipping this would be a stored
        // XSS vulnerability the moment any notice's text contained
        // markup, intentional or not.
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeDescription = WebUtility.HtmlEncode(description);
        var safeDestination = WebUtility.HtmlEncode(destinationUrl);

        var imageTags = string.IsNullOrWhiteSpace(imageUrl)
            ? ""
            : $"<meta property=\"og:image\" content=\"{WebUtility.HtmlEncode(imageUrl)}\" />\n" +
              $"<meta property=\"og:image:alt\" content=\"{safeTitle}\" />\n" +
              "<meta name=\"twitter:card\" content=\"summary_large_image\" />";

        var html = $@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"" />
<title>{safeTitle}</title>
<meta property=""og:site_name"" content=""UCP NoticeBoard"" />
<meta property=""og:title"" content=""{safeTitle}"" />
<meta property=""og:description"" content=""{safeDescription}"" />
<meta property=""og:url"" content=""{safeDestination}"" />
<meta property=""og:type"" content=""article"" />
{imageTags}
<meta http-equiv=""refresh"" content=""0;url={safeDestination}"" />
</head>
<body>
<p>Opening <a href=""{safeDestination}"">UCP NoticeBoard</a>…</p>
</body>
</html>";

        return new ContentResult { Content = html, ContentType = "text/html; charset=utf-8" };
    }
}
