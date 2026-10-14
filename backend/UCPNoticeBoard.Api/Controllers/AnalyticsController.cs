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

    public AnalyticsController(AppDbContext db)
    {
        _db = db;
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

        var pinError = PinHasher.VerifyOrSet(admin, adminPin, "Your 4-6 digit PIN is required for this action.");
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }
        await _db.SaveChangesAsync(); // persists a first-use PIN, if one was just set

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
