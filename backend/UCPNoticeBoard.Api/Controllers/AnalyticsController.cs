using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("analytics")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPinService _pins;

    public AnalyticsController(AppDbContext db, IPinService pins)
    {
        _db = db;
        _pins = pins;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    [HttpPost("visit")]
    public async Task<IActionResult> RecordVisit()
    {
        var user = await _db.Users.FindAsync(CurrentUserId);
        if (user is null) return NotFound();

        user.ViewCount += 1;
        user.LastSeenAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("summary")]
    [Authorize(Roles = "Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<AnalyticsSummaryDto>> GetSummary([FromHeader(Name = UsersController.AdminPinHeader)] string? adminPin)
    {
        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, adminPin, UsersController.AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();
        var users = await _db.Users.ToListAsync();
        var now = DateTime.UtcNow;
        var activeCutoff = now.AddDays(-7);
        var monthCutoff = now.AddDays(-30);

        var notices = await _db.Notices
            .Select(n => new { n.Id, n.Title, n.CreatedByUserId, n.CreatedAt, n.ViewCount, n.IsPinned })
            .ToListAsync();
        var names = users.ToDictionary(u => u.Id, u => u.Name);
        var recent = notices.Where(n => n.CreatedAt >= monthCutoff).ToList();

        var topNotices = recent
            .OrderByDescending(n => n.ViewCount)
            .ThenByDescending(n => n.CreatedAt)
            .Take(5)
            .Select(n => new NoticeActivityDto(n.Id, n.Title, names.GetValueOrDefault(n.CreatedByUserId, "Unknown"), n.CreatedAt, n.ViewCount, n.IsPinned))
            .ToList();

        var postsByAuthor = notices.ToLookup(n => n.CreatedByUserId);
        var publishers = users
            .Where(u => u.Role == UserRole.Publisher || (u.Role == UserRole.Admin && postsByAuthor[u.Id].Any()))
            .Select(u =>
            {
                var posts = postsByAuthor[u.Id].ToList();
                var recentPosts = posts.Where(n => n.CreatedAt >= monthCutoff).ToList();
                return new PublisherActivityDto(
                    u.Id,
                    u.Name,
                    NoticesLast30Days: recentPosts.Count,
                    TotalNotices: posts.Count,
                    ViewsLast30Days: recentPosts.Sum(n => n.ViewCount),
                    LastPostedAt: posts.Count == 0 ? null : posts.Max(n => n.CreatedAt));
            })
            .OrderByDescending(p => p.LastPostedAt ?? DateTime.MinValue)
            .ThenBy(p => p.Name)
            .ToList();

        var feedbackCutoff = now.AddDays(-90);
        var feedback = await _db.UninstallFeedback
            .Where(f => f.CreatedAt >= feedbackCutoff)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();
        var uninstallReasons = feedback
            .GroupBy(f => f.Reason)
            .Select(g => new UninstallReasonCountDto(g.Key, g.Count()))
            .OrderByDescending(r => r.Count)
            .ToList();
        var uninstallComments = feedback
            .Where(f => !string.IsNullOrWhiteSpace(f.Comment))
            .Take(10)
            .Select(f => new UninstallCommentDto(f.Reason, f.Comment!, f.ExtensionVersion, f.CreatedAt))
            .ToList();

        var summary = new AnalyticsSummaryDto(
            TotalUsers: users.Count,
            TotalStudents: users.Count(u => u.Role == UserRole.Student),
            TotalPublishers: users.Count(u => u.Role == UserRole.Publisher),
            TotalAdmins: users.Count(u => u.Role == UserRole.Admin),
            TotalViews: users.Sum(u => u.ViewCount),
            ActiveLast7Days: users.Count(u => u.LastSeenAt.HasValue && u.LastSeenAt.Value >= activeCutoff),
            NoticesLast30Days: recent.Count,
            TopNotices: topNotices,
            Publishers: publishers,
            UninstallReasons: uninstallReasons,
            UninstallComments: uninstallComments
        );

        return Ok(summary);
    }
}
