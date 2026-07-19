using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("notices")]
[Authorize]
public class NoticesController : ControllerBase
{
    // Notices older than this stop showing up anywhere in the extension.
    // They are NOT deleted from the database — just filtered out of every
    // query below — so nothing is lost if you ever want to change this.
    private static readonly TimeSpan NoticeLifetime = TimeSpan.FromDays(7);

    private readonly AppDbContext _db;

    public NoticesController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    private static NoticeDto ToDto(Notice n) => new(
        n.Id,
        n.Title,
        n.Description,
        n.ImageUrl,
        n.CreatedByUserId,
        n.CreatedByUser?.Name ?? "Unknown",
        n.CreatedAt,
        n.UpdatedAt
    );

    [HttpGet]
    public async Task<ActionResult<List<NoticeDto>>> GetNotices()
    {
        var cutoff = DateTime.UtcNow - NoticeLifetime;

        var notices = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Where(n => n.CreatedAt >= cutoff)
            // Newest first — as new notices are added, older ones naturally
            // drift toward the end of the horizontally scrolling carousel.
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        return Ok(notices.Select(ToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NoticeDto>> GetNotice(int id)
    {
        var notice = await _db.Notices.Include(n => n.CreatedByUser).FirstOrDefaultAsync(n => n.Id == id);
        if (notice is null) return NotFound();
        return Ok(ToDto(notice));
    }

    [HttpPost]
    [Authorize(Roles = "Publisher,Admin")]
    public async Task<ActionResult<NoticeDto>> CreateNotice([FromBody] CreateNoticeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest("Title and description are required.");
        }

        var notice = new Notice
        {
            Title = request.Title,
            Description = request.Description,
            ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim(),
            CreatedByUserId = CurrentUserId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Notices.Add(notice);
        await _db.SaveChangesAsync();

        await _db.Entry(notice).Reference(n => n.CreatedByUser).LoadAsync();

        return CreatedAtAction(nameof(GetNotice), new { id = notice.Id }, ToDto(notice));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    public async Task<ActionResult<NoticeDto>> UpdateNotice(int id, [FromBody] UpdateNoticeRequest request)
    {
        var notice = await _db.Notices.Include(n => n.CreatedByUser).FirstOrDefaultAsync(n => n.Id == id);
        if (notice is null) return NotFound();

        // A Publisher can only ever touch their own notices. Admin can touch any.
        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && notice.CreatedByUserId != CurrentUserId)
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest("Title and description are required.");
        }

        notice.Title = request.Title;
        notice.Description = request.Description;
        notice.ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();
        notice.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(ToDto(notice));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    public async Task<IActionResult> DeleteNotice(int id)
    {
        var notice = await _db.Notices.FindAsync(id);
        if (notice is null) return NotFound();

        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && notice.CreatedByUserId != CurrentUserId)
        {
            return Forbid();
        }

        _db.Notices.Remove(notice);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
