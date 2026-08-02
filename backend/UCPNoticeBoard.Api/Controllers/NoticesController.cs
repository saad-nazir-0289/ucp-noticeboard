using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("notices")]
[Authorize]
public class NoticesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly INoticeQueryService _noticeQuery;

    public NoticesController(AppDbContext db, INoticeQueryService noticeQuery)
    {
        _db = db;
        _noticeQuery = noticeQuery;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    [HttpGet]
    public async Task<ActionResult<List<NoticeDto>>> GetNotices([FromQuery] bool includeDismissed = false)
    {
        return Ok(await _noticeQuery.GetActiveNoticesAsync(CurrentUserId, includeDismissed));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NoticeDto>> GetNotice(int id)
    {
        var notice = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id);
        if (notice is null) return NotFound();

        return Ok(new NoticeDto(
            notice.Id, notice.Title, notice.Description, notice.ImageUrl, notice.LinkUrl,
            notice.CategoryId, notice.Category?.Name, notice.CreatedByUserId,
            notice.CreatedByUser?.Name ?? "Unknown", notice.CreatedAt, notice.UpdatedAt));
    }

    [HttpGet("dismissed")]
    public async Task<ActionResult<List<NoticeDto>>> GetDismissedNotices()
    {
        return Ok(await _noticeQuery.GetDismissedNoticesAsync(CurrentUserId));
    }

    [HttpPost("{id}/dismiss")]
    public async Task<IActionResult> DismissNotice(int id)
    {
        var userId = CurrentUserId;
        var alreadyDismissed = await _db.NoticeDismissals
            .AnyAsync(d => d.UserId == userId && d.NoticeId == id);

        if (!alreadyDismissed)
        {
            _db.NoticeDismissals.Add(new NoticeDismissal { UserId = userId, NoticeId = id });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{id}/dismiss")]
    public async Task<IActionResult> UndismissNotice(int id)
    {
        var userId = CurrentUserId;
        var dismissal = await _db.NoticeDismissals
            .FirstOrDefaultAsync(d => d.UserId == userId && d.NoticeId == id);

        if (dismissal is not null)
        {
            _db.NoticeDismissals.Remove(dismissal);
            await _db.SaveChangesAsync();
        }

        return NoContent();
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
            LinkUrl = string.IsNullOrWhiteSpace(request.LinkUrl) ? null : request.LinkUrl.Trim(),
            CategoryId = request.CategoryId,
            CreatedByUserId = CurrentUserId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Notices.Add(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        await _db.Entry(notice).Reference(n => n.CreatedByUser).LoadAsync();
        if (notice.CategoryId is not null)
        {
            await _db.Entry(notice).Reference(n => n.Category).LoadAsync();
        }

        var dto = new NoticeDto(
            notice.Id, notice.Title, notice.Description, notice.ImageUrl, notice.LinkUrl,
            notice.CategoryId, notice.Category?.Name, notice.CreatedByUserId,
            notice.CreatedByUser?.Name ?? "Unknown", notice.CreatedAt, notice.UpdatedAt);

        return CreatedAtAction(nameof(GetNotice), new { id = notice.Id }, dto);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    public async Task<ActionResult<NoticeDto>> UpdateNotice(int id, [FromBody] UpdateNoticeRequest request)
    {
        var notice = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id);
        if (notice is null) return NotFound();

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
        notice.LinkUrl = string.IsNullOrWhiteSpace(request.LinkUrl) ? null : request.LinkUrl.Trim();
        notice.CategoryId = request.CategoryId;
        notice.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();
        await _db.Entry(notice).Reference(n => n.Category).LoadAsync();

        return Ok(new NoticeDto(
            notice.Id, notice.Title, notice.Description, notice.ImageUrl, notice.LinkUrl,
            notice.CategoryId, notice.Category?.Name, notice.CreatedByUserId,
            notice.CreatedByUser?.Name ?? "Unknown", notice.CreatedAt, notice.UpdatedAt));
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
        _noticeQuery.InvalidateNoticesCache();

        return NoContent();
    }
}
