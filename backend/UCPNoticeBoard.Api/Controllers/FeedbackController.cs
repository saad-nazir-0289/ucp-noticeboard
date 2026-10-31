using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("feedback")]
public class FeedbackController : ControllerBase
{
    private readonly AppDbContext _db;

    public FeedbackController(AppDbContext db) => _db = db;

    /// <summary>
    /// Sent from the page Chrome opens after the extension is removed. No
    /// sign-in (they've just uninstalled it) and nothing that identifies
    /// them is kept: only the reason, an optional comment and the version.
    /// The Admin sees the totals in Analytics.
    /// </summary>
    [HttpPost("uninstall")]
    [AllowAnonymous]
    [EnableRateLimiting("feedback")]
    public async Task<IActionResult> Uninstall([FromBody] UninstallFeedbackRequest request)
    {
        if (!UninstallFeedback.Reasons.Contains(request.Reason))
        {
            return BadRequest("Please choose one of the reasons.");
        }

        var comment = request.Comment?.Trim();
        var version = request.ExtensionVersion?.Trim();
        _db.UninstallFeedback.Add(new UninstallFeedback
        {
            Reason = request.Reason,
            Comment = string.IsNullOrEmpty(comment) ? null : comment[..Math.Min(comment.Length, UninstallFeedback.CommentMaxLength)],
            ExtensionVersion = string.IsNullOrEmpty(version) ? null : version[..Math.Min(version.Length, 20)],
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
