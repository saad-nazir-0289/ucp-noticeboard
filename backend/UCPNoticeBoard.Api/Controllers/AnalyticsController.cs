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

    /// <summary>
    /// The dashboard (extension) or the web app was opened. Counts the visit
    /// for the day and hour, and the person once per day (overall and per
    /// place); the person's own record keeps only their latest times.
    /// </summary>
    [HttpPost("visit")]
    public async Task<IActionResult> RecordVisit([FromQuery] string? source)
    {
        var user = await _db.Users.FindAsync(CurrentUserId);
        if (user is null) return NotFound();

        var now = DateTime.UtcNow;
        var today = DailyCounter.PakistanDay(now);
        bool FirstToday(DateTime? last) => last is null || DailyCounter.PakistanDay(last.Value) < today;
        var place = source?.ToLowerInvariant() switch
        {
            "extension" => "extension",
            "app" => "app",
            _ => null,
        };

        var metrics = new List<string> { "visits", $"hour.{DailyCounter.ToPakistan(now).Hour:00}" };
        if (FirstToday(user.LastSeenAt)) metrics.Add("visitors");
        if (place == "extension")
        {
            metrics.Add("visits.extension");
            if (FirstToday(user.LastSeenExtensionAt)) metrics.Add("visitors.extension");
            user.LastSeenExtensionAt = now;
        }
        else if (place == "app")
        {
            metrics.Add("visits.app");
            if (FirstToday(user.LastSeenAppAt)) metrics.Add("visitors.app");
            user.LastSeenAppAt = now;
        }

        user.ViewCount += 1;
        user.LastSeenAt = now;
        await _db.SaveChangesAsync();
        await DailyCounter.AddAsync(_db, now, metrics.ToArray());

        return NoContent();
    }

    private static readonly int[] AllowedRanges = { 7, 30, 90 };

    [HttpGet("summary")]
    [Authorize(Roles = "Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<AnalyticsSummaryDto>> GetSummary(
        [FromHeader(Name = UsersController.AdminPinHeader)] string? adminPin,
        [FromQuery] int days = 30)
    {
        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, adminPin, UsersController.AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        if (!AllowedRanges.Contains(days)) days = 30;
        var now = DateTime.UtcNow;
        var today = DailyCounter.PakistanDay(now);
        // The range: the last `days` Pakistan days, today included, and the same length before it.
        var firstDay = today.AddDays(1 - days);
        var previousFirstDay = firstDay.AddDays(-days);
        // In UTC: Pakistan midnight is 19:00 UTC the day before.
        DateTime StartUtc(DateOnly day) => DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue) - DailyCounter.PakistanOffset, DateTimeKind.Utc);
        var rangeStart = StartUtc(firstDay);
        var previousStart = StartUtc(previousFirstDay);
        bool InRange(DateTime t) => t >= rangeStart;
        bool InPrevious(DateTime t) => t >= previousStart && t < rangeStart;

        var users = await _db.Users.AsNoTracking().ToListAsync();
        var notices = await _db.Notices.AsNoTracking()
            .Select(n => new
            {
                n.Id, n.Title, n.CreatedByUserId, n.CreatedAt, n.ViewCount, n.IsPinned, n.CategoryId,
                n.Deadline, n.DeletedAt, HasImage = n.ImageUrl != null, HasLink = n.LinkUrl != null,
            })
            .ToListAsync();
        var categories = await _db.Categories.AsNoTracking().OrderBy(c => c.Name).ToListAsync();
        var dismissals = await _db.NoticeDismissals.AsNoTracking()
            .Where(d => d.DismissedAt >= previousStart)
            .Select(d => d.DismissedAt)
            .ToListAsync();
        var subscriptions = await _db.PushSubscriptions.AsNoTracking()
            .Select(p => new { p.UserId, p.CreatedAt, p.CategoryFilter })
            .ToListAsync();
        var counts = await _db.DailyCounts.AsNoTracking()
            .Where(c => c.Day >= previousFirstDay)
            .ToListAsync();
        var trackingSince = await _db.DailyCounts.AsNoTracking()
            .OrderBy(c => c.Day)
            .Select(c => (DateOnly?)c.Day)
            .FirstOrDefaultAsync();
        int Count(DateOnly day, string metric) =>
            counts.Where(c => c.Day == day && c.Metric == metric).Sum(c => c.Count);
        int CountBetween(DateOnly from, DateOnly to, string metric) =>
            counts.Where(c => c.Day >= from && c.Day <= to && c.Metric == metric).Sum(c => c.Count);

        // ---------- Day by day ----------
        var dayList = new List<AnalyticsDayDto>();
        for (var day = firstDay; day <= today; day = day.AddDays(1))
        {
            var d = day;
            dayList.Add(new AnalyticsDayDto(
                d,
                NewUsers: users.Count(u => DailyCounter.PakistanDay(u.CreatedAt) == d),
                Visitors: Count(d, "visitors"),
                VisitorsExtension: Count(d, "visitors.extension"),
                VisitorsApp: Count(d, "visitors.app"),
                Visits: Count(d, "visits"),
                Opens: Count(d, "opens"),
                NoticesPosted: notices.Count(n => DailyCounter.PakistanDay(n.CreatedAt) == d),
                Archives: dismissals.Count(t => DailyCounter.PakistanDay(t) == d),
                NewSubscriptions: subscriptions.Count(p => DailyCounter.PakistanDay(p.CreatedAt) == d)));
        }

        AnalyticsTotalsDto Totals(Func<DateTime, bool> within, DateOnly from, DateOnly to) => new(
            NewUsers: users.Count(u => within(u.CreatedAt)),
            Visits: CountBetween(from, to, "visits"),
            Opens: CountBetween(from, to, "opens"),
            NoticesPosted: notices.Count(n => within(n.CreatedAt)),
            Archives: dismissals.Count(within),
            NewSubscriptions: subscriptions.Count(p => within(p.CreatedAt)));
        var current = Totals(InRange, firstDay, today);
        var previous = Totals(InPrevious, previousFirstDay, firstDay.AddDays(-1));

        var visitsByHour = Enumerable.Range(0, 24)
            .Select(h => CountBetween(firstDay, today, $"hour.{h:00}"))
            .ToList();

        // ---------- Audience ----------
        bool SeenInRange(DateTime? t) => t.HasValue && t.Value >= rangeStart;
        var audience = new AudienceDto(
            ExtensionOnly: users.Count(u => SeenInRange(u.LastSeenExtensionAt) && !SeenInRange(u.LastSeenAppAt)),
            AppOnly: users.Count(u => SeenInRange(u.LastSeenAppAt) && !SeenInRange(u.LastSeenExtensionAt)),
            Both: users.Count(u => SeenInRange(u.LastSeenExtensionAt) && SeenInRange(u.LastSeenAppAt)),
            Returning: users.Count(u => u.ViewCount >= 2),
            OneTime: users.Count(u => u.ViewCount == 1),
            NeverOpened: users.Count(u => u.ViewCount == 0),
            Dormant: users.Count(u => u.LastSeenAt.HasValue && u.LastSeenAt.Value < now.AddDays(-30)));

        // ---------- Notices ----------
        var standing = notices.Where(n => n.DeletedAt == null).ToList();
        bool IsLive(DateTime? deadline, bool pinned, DateTime created) =>
            deadline.HasValue ? deadline.Value > now : pinned || created >= now.AddDays(-7);
        var postedInRange = notices.Where(n => InRange(n.CreatedAt)).ToList();
        var noticeStats = new NoticeStatsDto(
            Live: standing.Count(n => IsLive(n.Deadline, n.IsPinned, n.CreatedAt)),
            Pinned: standing.Count(n => n.IsPinned),
            InBin: notices.Count(n => n.DeletedAt != null),
            PostedInRange: postedInRange.Count,
            WithPoster: postedInRange.Count(n => n.HasImage),
            WithDeadline: postedInRange.Count(n => n.Deadline != null),
            WithLink: postedInRange.Count(n => n.HasLink),
            AverageOpens: postedInRange.Count == 0 ? 0 : Math.Round(postedInRange.Average(n => n.ViewCount), 1));

        // ---------- Categories ----------
        List<int> Chosen(string? filter) => (filter ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => int.TryParse(x, out var id) ? id : -1)
            .Where(id => id > 0)
            .ToList();
        var chosenByDevice = subscriptions.Select(p => Chosen(p.CategoryFilter)).ToList();
        var categoryStats = categories
            .Select(c => new CategoryStatsDto(
                c.Id,
                c.Name,
                Posted: postedInRange.Count(n => n.CategoryId == c.Id),
                Opens: postedInRange.Where(n => n.CategoryId == c.Id).Sum(n => n.ViewCount),
                Live: standing.Count(n => n.CategoryId == c.Id && IsLive(n.Deadline, n.IsPinned, n.CreatedAt)),
                Subscribers: chosenByDevice.Count(list => list.Contains(c.Id))))
            .ToList();
        var uncategorised = postedInRange.Where(n => n.CategoryId == null).ToList();
        if (uncategorised.Count > 0)
            categoryStats.Add(new CategoryStatsDto(null, "No category", uncategorised.Count, uncategorised.Sum(n => n.ViewCount), 0, 0));
        categoryStats = categoryStats.OrderByDescending(c => c.Opens).ThenByDescending(c => c.Posted).ThenBy(c => c.Name).ToList();

        var notifications = new NotificationStatsDto(
            Devices: subscriptions.Count,
            People: subscriptions.Select(p => p.UserId).Distinct().Count(),
            AllTopics: chosenByDevice.Count(list => list.Count == 0),
            ChoseTopics: chosenByDevice.Count(list => list.Count > 0),
            NewInRange: current.NewSubscriptions);

        // ---------- Most opened, publishers, removal reasons ----------
        var names = users.ToDictionary(u => u.Id, u => u.Name);
        var topNotices = postedInRange
            .Where(n => n.DeletedAt == null)
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
                var recentPosts = posts.Where(n => InRange(n.CreatedAt)).ToList();
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

        return Ok(new AnalyticsSummaryDto(
            TotalUsers: users.Count,
            TotalStudents: users.Count(u => u.Role == UserRole.Student),
            TotalPublishers: users.Count(u => u.Role == UserRole.Publisher),
            TotalAdmins: users.Count(u => u.Role == UserRole.Admin),
            TotalViews: users.Sum(u => u.ViewCount),
            ActiveLast7Days: users.Count(u => u.LastSeenAt.HasValue && u.LastSeenAt.Value >= now.AddDays(-7)),
            NoticesLast30Days: notices.Count(n => n.CreatedAt >= now.AddDays(-30)),
            TopNotices: topNotices,
            Publishers: publishers,
            UninstallReasons: uninstallReasons,
            UninstallComments: uninstallComments,
            RangeDays: days,
            TrackingSince: trackingSince,
            Current: current,
            Previous: previous,
            ActiveToday: users.Count(u => u.LastSeenAt.HasValue && DailyCounter.PakistanDay(u.LastSeenAt.Value) == today),
            ActiveLast30Days: users.Count(u => u.LastSeenAt.HasValue && u.LastSeenAt.Value >= now.AddDays(-30)),
            ActiveInRange: users.Count(u => SeenInRange(u.LastSeenAt)),
            Days: dayList,
            VisitsByHour: visitsByHour,
            Audience: audience,
            Notices: noticeStats,
            Categories: categoryStats,
            Notifications: notifications));
    }
}
