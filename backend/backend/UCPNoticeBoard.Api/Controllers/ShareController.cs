using System.Net;
using Microsoft.AspNetCore.Mvc;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("share")]
public class ShareController : ControllerBase
{
    // Update this if the PWA ever moves to a different host.
    private const string PwaBaseUrl = "https://ucp-noticeboard.msndev.workers.dev";

    private readonly AppDbContext _db;

    public ShareController(AppDbContext db)
    {
        _db = db;
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
        var destinationUrl = $"{PwaBaseUrl}/?notice={id}";
        var notice = await _db.Notices.FindAsync(id);

        if (notice is null)
        {
            return BuildHtml("UCP NoticeBoard", "This notice is no longer available.", null, destinationUrl);
        }

        var description = notice.Description.Length > 200
            ? notice.Description[..200] + "..."
            : notice.Description;

        return BuildHtml(notice.Title, description, notice.ImageUrl, destinationUrl);
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

        // Omitted entirely (not a broken/placeholder image) when the
        // notice has none — most platforms degrade cleanly to a
        // text-only preview, which looks better than a broken image icon.
        var imageTag = string.IsNullOrWhiteSpace(imageUrl)
            ? ""
            : $"<meta property=\"og:image\" content=\"{WebUtility.HtmlEncode(imageUrl)}\" />\n<meta name=\"twitter:card\" content=\"summary_large_image\" />";

        var html = $@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"" />
<title>{safeTitle}</title>
<meta property=""og:title"" content=""{safeTitle}"" />
<meta property=""og:description"" content=""{safeDescription}"" />
<meta property=""og:url"" content=""{safeDestination}"" />
<meta property=""og:type"" content=""article"" />
{imageTag}
<meta http-equiv=""refresh"" content=""0;url={safeDestination}"" />
</head>
<body>
<p>Redirecting to <a href=""{safeDestination}"">UCP NoticeBoard</a>...</p>
</body>
</html>";

        return new ContentResult { Content = html, ContentType = "text/html" };
    }
}
