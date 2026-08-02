using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

public interface INoticeQueryService
{
    Task<List<NoticeDto>> GetActiveNoticesAsync(int userId, bool includeDismissed);
    Task<List<NoticeDto>> GetDismissedNoticesAsync(int userId);
    Task<List<CategoryDto>> GetCategoriesAsync();
    void InvalidateNoticesCache();
    void InvalidateCategoriesCache();
}

/// <summary>
/// The notice list is read constantly (every page load, by every student)
/// but changes rarely (only when a Publisher/Admin creates, edits, deletes,
/// or a notice ages past 7 days). Caching the base query for a short window
/// turns "every student's page load hits Postgres" into "Postgres gets hit
/// roughly once every few seconds, no matter how many students are
/// browsing" — this is the single highest-leverage thing for handling a
/// burst of concurrent users without the database becoming the bottleneck.
///
/// The per-user dismissal filter is applied AFTER the cached fetch, in
/// memory, since dismissals are personal and can't be cached globally —
/// but that filter is cheap (a small set lookup), so this still avoids the
/// expensive part (the DB round trip) on every request.
/// </summary>
public class NoticeQueryService : INoticeQueryService
{
    private const string NoticesCacheKey = "active-notices";
    private const string CategoriesCacheKey = "categories";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan NoticeLifetime = TimeSpan.FromDays(7);

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
        n.CreatedByUserId,
        n.CreatedByUser?.Name ?? "Unknown",
        n.CreatedAt,
        n.UpdatedAt
    );

    private async Task<List<NoticeDto>> GetActiveNoticesUncachedAsync()
    {
        var cutoff = DateTime.UtcNow - NoticeLifetime;
        var notices = await _db.Notices
            .Include(n => n.CreatedByUser)
            .Include(n => n.Category)
            .Where(n => n.CreatedAt >= cutoff)
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        return notices.Select(ToDto).ToList();
    }

    public async Task<List<NoticeDto>> GetActiveNoticesAsync(int userId, bool includeDismissed)
    {
        var allActive = await _cache.GetOrCreateAsync(NoticesCacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheDuration;
            return await GetActiveNoticesUncachedAsync();
        }) ?? new List<NoticeDto>();

        if (includeDismissed)
        {
            return allActive;
        }

        var dismissedIds = (await _db.NoticeDismissals
            .Where(d => d.UserId == userId)
            .Select(d => d.NoticeId)
            .ToListAsync()).ToHashSet();

        return allActive.Where(n => !dismissedIds.Contains(n.Id)).ToList();
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

    /// <summary>
    /// Called right after any create/update/delete so the very next read
    /// reflects the change immediately, instead of waiting out the cache
    /// window — the cache is for read load, not for hiding your own edits.
    /// </summary>
    public void InvalidateNoticesCache()
    {
        _cache.Remove(NoticesCacheKey);
    }

    public void InvalidateCategoriesCache()
    {
        _cache.Remove(CategoriesCacheKey);
    }
}
