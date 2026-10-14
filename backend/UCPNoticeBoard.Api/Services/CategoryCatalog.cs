using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// The fixed set of categories. Nobody creates categories any more: a
/// stable list is what lets students' notification topics, Quick fill's
/// category guess and the feed filters all mean the same thing over time.
/// Changing the list is a code change (here and in shared/categories.ts).
/// </summary>
public static class CategoryCatalog
{
    /// <summary>In the order the apps show them.</summary>
    public static readonly IReadOnlyList<string> Names = new[]
    {
        "Academics",     // exams, timetables, results, classes, fees, registration
        "Campus",        // library, transport, holidays, closures, facilities, general news
        "Careers",       // jobs, internships, hiring, placements
        "Scholarships",  // scholarships, financial aid, grants, fellowships, exchanges
        "Workshops",     // workshops, seminars, webinars, talks, trainings, bootcamps
        "Competitions",  // hackathons, contests, debates, championships, pitch competitions
        "Events",        // festivals, ceremonies, conferences, meetups, exhibitions, trips
        "Societies",     // club and society news, recruitment, auditions
        "Sports",        // trials, tournaments, matches
    };

    public static int SortOrder(string name)
    {
        var index = Names.ToList().FindIndex(n => n.Equals(name, StringComparison.OrdinalIgnoreCase));
        return index < 0 ? int.MaxValue : index;
    }

    // Which catalog category an older, free-form category belongs to, by
    // the words in its name. First match wins, so the more specific kinds
    // come before the catch-alls ("Tech Workshop" is a Workshop, not an Event).
    private static readonly (string Target, string[] Words)[] LegacyRules =
    {
        ("Workshops", new[] { "workshop", "seminar", "webinar", "talk", "session", "training", "bootcamp", "masterclass" }),
        ("Competitions", new[] { "competition", "hackathon", "contest", "olympiad", "challenge", "debate", "championship" }),
        ("Scholarships", new[] { "scholar", "financial", "grant", "fellowship", "funding", "exchange" }),
        ("Careers", new[] { "career", "job", "intern", "placement", "hiring", "employ" }),
        ("Societies", new[] { "societ", "club" }),
        ("Sports", new[] { "sport", "tournament", "athletic" }),
        ("Academics", new[] { "academic", "exam", "class", "course", "semester", "result", "lecture", "timetable", "fee", "study" }),
        ("Events", new[] { "event", "fest", "ceremony", "conference", "meetup", "expo", "exhibition", "trip", "gala", "celebration" }),
        ("Campus", new[] { "campus", "general", "announcement", "notice", "admin", "library", "transport", "holiday", "facilit", "service", "news", "update" }),
    };

    /// <summary>The catalog category an old category's notices move to, or null when nothing fits.</summary>
    public static string? MapLegacyName(string name)
    {
        var lower = name.ToLowerInvariant();
        foreach (var (target, words) in LegacyRules)
        {
            if (words.Any(lower.Contains)) return target;
        }
        return null;
    }

    /// <summary>
    /// Makes the database hold exactly the catalog: adds missing categories,
    /// then moves each other category's notices (and any notification topic
    /// pointing at it) to its catalog match and removes it. Runs at every
    /// start and does nothing once the database is in shape.
    /// </summary>
    public static async Task EnsureAsync(AppDbContext db, ILogger? logger = null, CancellationToken cancellationToken = default)
    {
        var existing = await db.Categories.ToListAsync(cancellationToken);
        var byName = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in existing.Where(c => Names.Contains(c.Name, StringComparer.OrdinalIgnoreCase)))
        {
            byName.TryAdd(category.Name, category);
        }

        foreach (var name in Names.Where(n => !byName.ContainsKey(n)))
        {
            var category = new Category { Name = name, CreatedAt = DateTime.UtcNow };
            db.Categories.Add(category);
            byName[name] = category;
        }
        await db.SaveChangesAsync(cancellationToken);

        var legacy = existing.Where(c => !byName.TryGetValue(c.Name, out var kept) || kept.Id != c.Id).ToList();
        if (legacy.Count == 0) return;

        var moves = legacy.ToDictionary(c => c.Id, c => MapLegacyName(c.Name) is { } target ? byName[target].Id : (int?)null);
        foreach (var category in legacy)
        {
            var targetId = moves[category.Id];
            var notices = await db.Notices.Where(n => n.CategoryId == category.Id).ToListAsync(cancellationToken);
            foreach (var notice in notices) notice.CategoryId = targetId;
            logger?.LogInformation(
                "Category \"{Old}\" retired: {Count} notices moved to {New}.",
                category.Name, notices.Count, targetId is null ? "no category" : byName.Values.First(c => c.Id == targetId).Name);
        }

        // Notification topics are stored as "3,7,9": point them at the new ids.
        var subscriptions = await db.PushSubscriptions.Where(p => p.CategoryFilter != null).ToListAsync(cancellationToken);
        foreach (var subscription in subscriptions)
        {
            var ids = subscription.CategoryFilter!
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => int.TryParse(s, out var id) ? id : (int?)null)
                .Where(id => id is not null)
                .Select(id => moves.TryGetValue(id!.Value, out var moved) ? moved : id)
                .Where(id => id is not null)
                .Distinct()
                .ToList();
            // A filter that pointed only at categories with no match would
            // otherwise silence that device: back to "everything".
            subscription.CategoryFilter = ids.Count == 0 ? null : string.Join(",", ids);
        }

        db.Categories.RemoveRange(legacy);
        await db.SaveChangesAsync(cancellationToken);
    }
}
