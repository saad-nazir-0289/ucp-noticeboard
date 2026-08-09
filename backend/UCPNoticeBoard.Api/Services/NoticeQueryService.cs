using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

public interface INoticeQueryService
{
    Task<List<NoticeDto>> GetActiveNoticesAsync(int userId, bool includeDismissed, bool includeExpired = false);
    Task<List<NoticeDto>> GetDismissedNoticesAsync(int userId);
    Task<List<CategoryDto>> GetCategoriesAsync();
    void InvalidateNoticesCache();
    void InvalidateCategoriesCache();
}

/// <summary>
/// A notice is visible to students if:
///   - it has a Deadline, and that deadline hasn't passed yet, OR
///   - it has no Deadline, and it's less than 7 days old.
/// Either way, "not visible" NEVER means deleted — every query here filters
/// what's returned, nothing here ever removes a row. Admin/Publisher
/// management views pass includeExpired=true specifically to see
/// everything regardless of this visibility rule, since they need to be
/// able to review, edit, or manually delete old notices — that capability
/// was previously (incorrectly) hidden along with the notice itself.
/// </summary>
public class NoticeQueryService : INoticeQueryService
{
    private const string NoticesCacheKey = "active-notices";
    private const string CategoriesCacheKey = "categories";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan DefaultNoticeLifetime = TimeSpan.FromDays(7);

    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;

    public NoticeQueryService(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    private static NoticeDto ToDto(Notice n) => new(
        n.Id,
        n.Title,
        n.Description,
        n.ImageUrl,
        n.LinkUrl,
        n.CategoryId,
        n.Category?.Name,
        n.Deadline,
        n.CreatedByUserId,
        n.CreatedByUser?.Name ?? "Unknown",
        n.CreatedAt,
        n.UpdatedAt
    );

    private async Task<List<NoticeDto>> GetActiveNoticesUncachedAsync()
    {
        var now = DateTime.UtcNow;
        var defaultCutoff = now - DefaultNoticeLifetime;

        var notices = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .Where(n =>
                (n.Deadline != null && n.Deadline > now) ||
                (n.Deadline == null && n.CreatedAt >= defaultCutoff))
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        return notices.Select(ToDto).ToList();
    }

    /// <summary>Every notice ever created, regardless of expiry — for management views only.</summary>
    private async Task<List<NoticeDto>> GetAllNoticesUncachedAsync()
    {
        var notices = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        return notices.Select(ToDto).ToList();
    }

    public async Task<List<NoticeDto>> GetActiveNoticesAsync(int userId, bool includeDismissed, bool includeExpired = false)
    {
        // Management views (includeExpired=true) are lower-traffic and need
        // to always be current, so they bypass the cache entirely rather
        // than sharing it with the high-traffic student feed query.
        var all = includeExpired
            ? await GetAllNoticesUncachedAsync()
            : await _cache.GetOrCreateAsync(NoticesCacheKey, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = CacheDuration;
                return await GetActiveNoticesUncachedAsync();
            }) ?? new List<NoticeDto>();

        if (includeDismissed)
        {
            return all;
        }

        var dismissedIds = (await _db.NoticeDismissals
            .Where(d => d.UserId == userId)
            .Select(d => d.NoticeId)
            .ToListAsync()).ToHashSet();

        return all.Where(n => !dismissedIds.Contains(n.Id)).ToList();
    }

    public async Task<List<NoticeDto>> GetDismissedNoticesAsync(int userId)
    {
        var allActive = await _cache.GetOrCreateAsync(NoticesCacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheDuration;
            return await GetActiveNoticesUncachedAsync();
        }) ?? new List<NoticeDto>();

        var dismissedIds = (await _db.NoticeDismissals
            .Where(d => d.UserId == userId)
            .Select(d => d.NoticeId)
            .ToListAsync()).ToHashSet();

        return allActive.Where(n => dismissedIds.Contains(n.Id)).ToList();
    }

    public async Task<List<CategoryDto>> GetCategoriesAsync()
    {
        return await _cache.GetOrCreateAsync(CategoriesCacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            return await _db.Categories
                .OrderBy(c => c.Name)
                .Select(c => new CategoryDto(c.Id, c.Name))
                .ToListAsync();
        }) ?? new List<CategoryDto>();
    }

    public void InvalidateNoticesCache()
    {
        _cache.Remove(NoticesCacheKey);
    }

    public void InvalidateCategoriesCache()
    {
        _cache.Remove(CategoriesCacheKey);
    }
}
