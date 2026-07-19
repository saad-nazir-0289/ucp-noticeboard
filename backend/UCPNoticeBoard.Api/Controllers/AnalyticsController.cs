using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("analytics")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AnalyticsController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// Called once every time the NoticeBoard mounts on the dashboard (i.e.
    /// every page load), regardless of whether the user's session was
    /// already cached. This is what "views"/"visitors" are counted from.
    /// </summary>
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
    public async Task<ActionResult<AnalyticsSummaryDto>> GetSummary()
    {
        var users = await _db.Users.ToListAsync();
        var activeCutoff = DateTime.UtcNow.AddDays(-7);

        var summary = new AnalyticsSummaryDto(
            TotalUsers: users.Count,
            TotalStudents: users.Count(u => u.Role == UserRole.Student),
            TotalPublishers: users.Count(u => u.Role == UserRole.Publisher),
            TotalAdmins: users.Count(u => u.Role == UserRole.Admin),
            TotalViews: users.Sum(u => u.ViewCount),
            ActiveLast7Days: users.Count(u => u.LastSeenAt.HasValue && u.LastSeenAt.Value >= activeCutoff)
        );

        return Ok(summary);
    }
}
