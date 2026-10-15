using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class CategoryCatalogTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public CategoryCatalogTests(ApiFactory api) => _api = api;

    [Theory]
    [InlineData("Non-Tech Event", "Events")]
    [InlineData("Tech Event", "Events")]
    [InlineData("Tech Workshop", "Workshops")]
    [InlineData("Hackathons", "Competitions")]
    [InlineData("Jobs & Internships", "Careers")]
    [InlineData("Scholarship", "Scholarships")]
    [InlineData("Clubs", "Societies")]
    [InlineData("Exams", "Academics")]
    [InlineData("General", "Campus")]
    [InlineData("Misc", null)]
    public void OldCategoryNames_MapToTheCatalog(string old, string? expected)
    {
        Assert.Equal(expected, CategoryCatalog.MapLegacyName(old));
    }

    [Fact]
    public async Task OldCategories_AreFoldedIn_WithTheirNoticesAndNotificationTopics()
    {
        using var scope = _api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var author = (await _api.CreatePublisherAsync()).Id;

        // A database from before the catalog: free-form categories in use.
        var nonTech = new Category { Name = "Non-Tech Event" };
        var hackathons = new Category { Name = "Hackathons" };
        var misc = new Category { Name = "Misc" };
        db.Categories.AddRange(nonTech, hackathons, misc);
        await db.SaveChangesAsync();
        var events = await db.Categories.SingleAsync(c => c.Name == "Events");
        var competitions = await db.Categories.SingleAsync(c => c.Name == "Competitions");

        Notice NoticeIn(Category c) => new() { Title = c.Name, Description = "x", CategoryId = c.Id, CreatedByUserId = author };
        var notices = new[] { NoticeIn(nonTech), NoticeIn(hackathons), NoticeIn(misc) };
        db.Notices.AddRange(notices);
        var mixed = new PushSubscription { UserId = author, Endpoint = $"https://push.example/{Guid.NewGuid()}", P256dh = "k", Auth = "a", CategoryFilter = $"{nonTech.Id},{events.Id},{hackathons.Id}" };
        var onlyMisc = new PushSubscription { UserId = author, Endpoint = $"https://push.example/{Guid.NewGuid()}", P256dh = "k", Auth = "a", CategoryFilter = $"{misc.Id}" };
        db.PushSubscriptions.AddRange(mixed, onlyMisc);
        await db.SaveChangesAsync();

        await CategoryCatalog.EnsureAsync(db);
        await CategoryCatalog.EnsureAsync(db); // safe to run again
        db.ChangeTracker.Clear();

        Assert.Equal(CategoryCatalog.Names.OrderBy(n => n), (await db.Categories.Select(c => c.Name).ToListAsync()).OrderBy(n => n));
        var after = await db.Notices.Where(n => notices.Select(x => x.Id).Contains(n.Id)).ToDictionaryAsync(n => n.Title, n => n.CategoryId);
        Assert.Equal(events.Id, after["Non-Tech Event"]);
        Assert.Equal(competitions.Id, after["Hackathons"]);
        Assert.Null(after["Misc"]);
        Assert.Equal($"{events.Id},{competitions.Id}", (await db.PushSubscriptions.FindAsync(mixed.Id))!.CategoryFilter);
        Assert.Null((await db.PushSubscriptions.FindAsync(onlyMisc.Id))!.CategoryFilter); // back to "everything"
    }
}
