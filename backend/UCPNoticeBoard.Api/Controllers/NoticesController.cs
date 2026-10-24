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
        n.CreatedByUser?.Name ?? "Unknown", n.CreatedAt, n.UpdatedAt, n.ViewCount, n.IsPinned, n.CreatedByUser?.LogoUrl, n.SendLastCall), CanSeeViews);

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
            IsPinned = User.IsInRole("Admin") && request.IsPinned == true,
            SendLastCall = request.SendLastCall == true
        };

        _db.Notices.Add(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();
        SharePreviewImage.PrepareInBackground(notice.ImageUrl);

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
        var pushUrl = NoticeLink(notice.Id);

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var pushService = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();
                await pushService.NotifyAllAsync(pushTitle, pushBody, url: pushUrl, imageUrl: pushImageUrl, categoryId: pushCategoryId);
            }
            catch
            {
                // Best-effort — a broadcast failure should never be visible
                // as an error anywhere the Publisher can see it.
            }
        });

        return CreatedAtAction(nameof(GetNotice), new { id = notice.Id }, responseDto);
    }

    /// <summary>
    /// Where tapping a notification about this notice lands: the PWA, with
    /// the notice open. Relative, so the service worker resolves it against
    /// whichever PWA (production or staging) the subscription came from.
    /// </summary>
    public static string NoticeLink(int noticeId) => $"/?notice={noticeId}";

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
        var deadline = request.Deadline?.ToUniversalTime();
        if (deadline != notice.Deadline)
        {
            // A moved deadline gets its reminders again, for the new time.
            notice.ReminderSent = false;
            notice.LastCallSent = false;
        }
        notice.Deadline = deadline;
        notice.UpdatedAt = DateTime.UtcNow;
        if (request.SendLastCall is bool lastCall && lastCall != notice.SendLastCall)
        {
            notice.SendLastCall = lastCall;
            notice.LastCallSent = false;
        }

        if (isAdmin && request.IsPinned is bool pinned)
        {
            notice.IsPinned = pinned;
        }

        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();
        SharePreviewImage.PrepareInBackground(notice.ImageUrl);
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

        MoveToBin(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return NoContent();
    }

    /// <summary>How long a deleted notice can still be restored.</summary>
    public static readonly TimeSpan BinRetention = TimeSpan.FromDays(30);

    private void MoveToBin(Notice notice)
    {
        notice.DeletedAt = DateTime.UtcNow;
        notice.DeletedByUserId = CurrentUserId;
    }

    /// <summary>
    /// Deleted notices that can still be restored: everyone's for the
    /// Admin, a Publisher's own otherwise. Newest deletion first.
    /// </summary>
    [HttpGet("bin")]
    [Authorize(Roles = "Publisher,Admin")]
    public async Task<ActionResult<List<BinNoticeDto>>> GetBin()
    {
        var isAdmin = User.IsInRole("Admin");
        var me = CurrentUserId;
        var binned = await _db.Notices
            .IgnoreQueryFilters()
            .Include(n => n.CreatedByUser)
            .Where(n => n.DeletedAt != null && (isAdmin || n.CreatedByUserId == me))
            .OrderByDescending(n => n.DeletedAt)
            .ToListAsync();

        var deleterIds = binned.Select(n => n.DeletedByUserId ?? 0).Distinct().ToList();
        var deleters = await _db.Users.Where(u => deleterIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name);

        return Ok(binned.Select(n => new BinNoticeDto(
            n.Id,
            n.Title,
            n.CreatedByUser?.Name ?? "Unknown",
            n.CreatedAt,
            n.DeletedAt!.Value,
            n.DeletedByUserId is int by && deleters.TryGetValue(by, out var name) ? name : "Unknown",
            n.DeletedAt!.Value + BinRetention)).ToList());
    }

    /// <summary>Puts a deleted notice back exactly as it was. Same rules as deleting it.</summary>
    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<IActionResult> RestoreNotice(int id, [FromQuery] string? pin)
    {
        var notice = await _db.Notices.IgnoreQueryFilters().FirstOrDefaultAsync(n => n.Id == id && n.DeletedAt != null);
        if (notice is null) return NotFound("That notice isn't in the bin any more.");

        if (!User.IsInRole("Admin") && notice.CreatedByUserId != CurrentUserId)
        {
            return Forbid();
        }

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(currentUser, pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        notice.DeletedAt = null;
        notice.DeletedByUserId = null;
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return NoContent();
    }

    private const int MaxBatchDelete = 200;

    /// <summary>
    /// Deletes several notices in one go: one PIN (or unlocked device) check
    /// for the lot, so clearing out old notices doesn't need a request, or a
    /// PIN, per notice. All or nothing: a Publisher who includes someone
    /// else's notice deletes none.
    /// </summary>
    [HttpPost("delete")]
    [Authorize(Roles = "Publisher,Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<DeleteNoticesResponse>> DeleteNotices([FromBody] DeleteNoticesRequest request)
    {
        var ids = request.Ids?.Distinct().ToList() ?? new List<int>();
        if (ids.Count == 0) return BadRequest("Choose at least one notice.");
        if (ids.Count > MaxBatchDelete) return BadRequest($"Delete at most {MaxBatchDelete} notices at a time.");

        var currentUser = await _db.Users.FindAsync(CurrentUserId);
        if (currentUser is null) return Unauthorized();

        var notices = await _db.Notices.Where(n => ids.Contains(n.Id)).ToListAsync();
        if (!User.IsInRole("Admin") && notices.Any(n => n.CreatedByUserId != CurrentUserId))
        {
            return Forbid();
        }

        var pinCheck = await _pins.AuthorizeAsync(currentUser, request.Pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        foreach (var notice in notices) MoveToBin(notice);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return Ok(new DeleteNoticesResponse(notices.Count));
    }
}
