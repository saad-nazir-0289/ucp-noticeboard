using System.Security.Claims;
using System.Text.RegularExpressions;
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
    private static readonly Regex PinFormat = new(@"^\d{4,6}$", RegexOptions.Compiled);

    private readonly AppDbContext _db;
    private readonly INoticeQueryService _noticeQuery;
    private readonly IServiceScopeFactory _scopeFactory;

    public NoticesController(AppDbContext db, INoticeQueryService noticeQuery, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _noticeQuery = noticeQuery;
        _scopeFactory = scopeFactory;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    private static NoticeDto ToDto(Notice n, bool likedByMe = false) => new(
        n.Id, n.Title, n.Description, n.ImageUrl, n.LinkUrl,
        n.CategoryId, n.Category?.Name, n.Deadline, n.CreatedByUserId,
        n.CreatedByUser?.Name ?? "Unknown", n.CreatedAt, n.UpdatedAt, n.ViewCount, n.LikeCount, likedByMe);

    /// <summary>
    /// The actual security boundary for anything that changes public
    /// content. If this account has never set a PIN, whatever's supplied
    /// here becomes their PIN from this point on — otherwise it must
    /// match exactly. Mutates the passed-in user (caller is responsible
    /// for SaveChangesAsync). Returns null on success, an error message
    /// on failure.
    /// </summary>
    private static string? VerifyOrSetPin(User user, string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin) || !PinFormat.IsMatch(pin))
        {
            return "A 4-6 digit PIN is required.";
        }

        var hash = PinHasher.Hash(pin);

        if (user.PinHash is null)
        {
            user.PinHash = hash;
            return null;
        }

        return user.PinHash == hash ? null : "Incorrect PIN.";
    }

    [HttpGet]
    public async Task<ActionResult<List<NoticeDto>>> GetNotices(
        [FromQuery] bool includeDismissed = false,
        [FromQuery] bool includeExpired = false)
    {
        var canSeeExpired = includeExpired && (User.IsInRole("Publisher") || User.IsInRole("Admin"));
        return Ok(await _noticeQuery.GetActiveNoticesAsync(CurrentUserId, includeDismissed, canSeeExpired));
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

        var likedByMe = await _db.NoticeLikes.AnyAsync(l => l.UserId == CurrentUserId && l.NoticeId == id);
        return Ok(ToDto(notice, likedByMe));
    }

    [HttpGet("dismissed")]
    public async Task<ActionResult<List<NoticeDto>>> GetDismissedNotices()
    {
        return Ok(await _noticeQuery.GetDismissedNoticesAsync(CurrentUserId));
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

    [HttpPost("{id}/like")]
    public async Task<IActionResult> LikeNotice(int id)
    {
        var userId = CurrentUserId;
        var alreadyLiked = await _db.NoticeLikes
            .AnyAsync(l => l.UserId == userId && l.NoticeId == id);

        if (!alreadyLiked)
        {
            var notice = await _db.Notices.FindAsync(id);
            if (notice is null) return NotFound();

            _db.NoticeLikes.Add(new NoticeLike { UserId = userId, NoticeId = id });
            notice.LikeCount++;
            await _db.SaveChangesAsync();
            _noticeQuery.InvalidateNoticesCache();
        }

        return NoContent();
    }

    [HttpDelete("{id}/like")]
    public async Task<IActionResult> UnlikeNotice(int id)
    {
        var userId = CurrentUserId;
        var like = await _db.NoticeLikes
            .FirstOrDefaultAsync(l => l.UserId == userId && l.NoticeId == id);

        if (like is not null)
        {
            var notice = await _db.Notices.FindAsync(id);
            if (notice is not null && notice.LikeCount > 0)
            {
                notice.LikeCount--;
            }
            _db.NoticeLikes.Remove(like);
            await _db.SaveChangesAsync();
            _noticeQuery.InvalidateNoticesCache();
        }

        return NoContent();
    }

    // A dedicated, stricter limit than the general 60/min — this is where
    // PIN guesses actually happen, so it gets its own tighter ceiling on
    // top of the general one, not instead of it.
    [HttpPost]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("notice-mutation")]
    public async Task<ActionResult<NoticeDto>> CreateNotice([FromBody] CreateNoticeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest("Title and description are required.");
        }

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var pinError = VerifyOrSetPin(currentUser, request.Pin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

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
    [EnableRateLimiting("notice-mutation")]
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

        var pinError = VerifyOrSetPin(currentUser, request.Pin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

        notice.Title = request.Title;
        notice.Description = request.Description;
        notice.ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();
        notice.LinkUrl = string.IsNullOrWhiteSpace(request.LinkUrl) ? null : request.LinkUrl.Trim();
        notice.CategoryId = request.CategoryId;
        notice.Deadline = request.Deadline?.ToUniversalTime();
        notice.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();
        await _db.Entry(notice).Reference(n => n.Category).LoadAsync();

        return Ok(ToDto(notice));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("notice-mutation")]
    public async Task<IActionResult> DeleteNotice(int id, [FromQuery] string pin)
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

        var pinError = VerifyOrSetPin(currentUser, pin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

        _db.Notices.Remove(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return NoContent();
    }
}
