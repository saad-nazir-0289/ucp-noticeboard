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
[Route("notices")]
[Authorize]
public class NoticesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly INoticeQueryService _noticeQuery;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPinService _pins;

    public NoticesController(AppDbContext db, INoticeQueryService noticeQuery, IServiceScopeFactory scopeFactory, IPinService pins)
    {
        _db = db;
        _noticeQuery = noticeQuery;
        _scopeFactory = scopeFactory;
        _pins = pins;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    private bool CanSeeViews => User.IsInRole("Admin");

    private NoticeDto ToDto(Notice n) => NoticeQueryService.ForViewer(new(
        n.Id, n.Title, n.Description, n.ImageUrl, n.LinkUrl,
        n.CategoryId, n.Category?.Name, n.Deadline, n.CreatedByUserId,
        n.CreatedByUser?.Name ?? "Unknown", n.CreatedAt, n.UpdatedAt, n.ViewCount, n.IsPinned), CanSeeViews);

    [HttpGet]
    public async Task<ActionResult<List<NoticeDto>>> GetNotices(
        [FromQuery] bool includeDismissed = false,
        [FromQuery] bool includeExpired = false)
    {
        var canSeeExpired = includeExpired && (User.IsInRole("Publisher") || User.IsInRole("Admin"));
        return Ok(await _noticeQuery.GetActiveNoticesAsync(CurrentUserId, includeDismissed, canSeeExpired, CanSeeViews));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<NoticeDto>> GetNotice(int id)
    {
        var notice = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .FirstOrDefaultAsync(n => n.Id == id);
        if (notice is null) return NotFound();

        notice.ViewCount++;
        await _db.SaveChangesAsync();

        return Ok(ToDto(notice));
    }

    [HttpGet("dismissed")]
    public async Task<ActionResult<List<NoticeDto>>> GetDismissedNotices()
    {
        return Ok(await _noticeQuery.GetDismissedNoticesAsync(CurrentUserId, CanSeeViews));
    }

    /// <summary>
    /// Registers a view without the cost of a full notice fetch. Opening
    /// a notice from the feed shows the already-held object instantly (no
    /// network round trip, no added latency) — this exists purely so that
    /// the MAJORITY of real opens, which never call GET /notices/{id} at
    /// all, still get counted. GET /notices/{id} still independently
    /// increments too, for deep-linked/shared opens specifically — the
    /// two paths are mutually exclusive per open, so nothing double-counts.
    /// </summary>
    [HttpPost("{id}/view")]
    public async Task<IActionResult> RegisterView(int id)
    {
        var notice = await _db.Notices.FindAsync(id);
        if (notice is null) return NotFound();

        notice.ViewCount++;
        await _db.SaveChangesAsync();

        return NoContent();
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

    // A dedicated, stricter limit than the general 60/min — this is where
    // PIN guesses actually happen, so it gets its own tighter ceiling on
    // top of the general one, not instead of it.
    [HttpPost]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<NoticeDto>> CreateNotice([FromBody] CreateNoticeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest("Title and description are required.");
        }

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(currentUser, request.Pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var notice = new Notice
        {
            Title = request.Title,
            Description = request.Description,
            ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim(),
            LinkUrl = string.IsNullOrWhiteSpace(request.LinkUrl) ? null : request.LinkUrl.Trim(),
            CategoryId = request.CategoryId,
            Deadline = request.Deadline?.ToUniversalTime(),
            CreatedByUserId = CurrentUserId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsPinned = User.IsInRole("Admin") && request.IsPinned == true
        };

        _db.Notices.Add(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        await _db.Entry(notice).Reference(n => n.CreatedByUser).LoadAsync();
        if (notice.CategoryId is not null)
        {
            await _db.Entry(notice).Reference(n => n.Category).LoadAsync();
        }

        var responseDto = ToDto(notice);
        var pushTitle = notice.Title;
        var pushBody = TrimForPush(notice.Description);
        var pushImageUrl = notice.ImageUrl;
        var pushCategoryId = notice.CategoryId;

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var pushService = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();
                await pushService.NotifyAllAsync(pushTitle, pushBody, imageUrl: pushImageUrl, categoryId: pushCategoryId);
            }
            catch
            {
                // Best-effort — a broadcast failure should never be visible
                // as an error anywhere the Publisher can see it.
            }
        });

        return CreatedAtAction(nameof(GetNotice), new { id = notice.Id }, responseDto);
    }

    private static string TrimForPush(string description) =>
        description.Length > 120 ? description[..120] + "..." : description;

    [HttpPut("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("pin-check")]
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

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(currentUser, request.Pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        notice.Title = request.Title;
        notice.Description = request.Description;
        notice.ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();
        notice.LinkUrl = string.IsNullOrWhiteSpace(request.LinkUrl) ? null : request.LinkUrl.Trim();
        notice.CategoryId = request.CategoryId;
        notice.Deadline = request.Deadline?.ToUniversalTime();
        notice.UpdatedAt = DateTime.UtcNow;
        if (isAdmin && request.IsPinned is bool pinned)
        {
            notice.IsPinned = pinned;
        }

        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();
        await _db.Entry(notice).Reference(n => n.Category).LoadAsync();

        return Ok(ToDto(notice));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<IActionResult> DeleteNotice(int id, [FromQuery] string? pin)
    {
        var notice = await _db.Notices.FindAsync(id);
        if (notice is null) return NotFound();

        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && notice.CreatedByUserId != CurrentUserId)
        {
            return Forbid();
        }

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(currentUser, pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        _db.Notices.Remove(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return NoContent();
    }
}
