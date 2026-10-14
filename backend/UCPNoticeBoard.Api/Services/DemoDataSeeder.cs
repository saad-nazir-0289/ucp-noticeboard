using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Fills an EMPTY database with realistic sample content, so a local run
/// or a staging deploy has something to look at and click through.
///
/// Opt-in only (SeedDemoData=true), and it refuses to touch a database
/// that already has any users — so even a flag set by mistake on a real
/// deploy does nothing. Dates are relative to "now", so the feed always
/// shows a mix of fresh, soon-due, and expired notices whenever it runs.
///
/// Demo accounts (log in with these Roll Numbers; every privileged
/// account's PIN is <see cref="DemoPin"/>):
///   Admin      L1F21BSCS0001  Demo Admin
///   Publisher  L1F21BSCS0002  Computing Society
///   Publisher  L1F22BSSE0003  Student Affairs Office
///   Student    L1F23BSCS0004 .. L1F23BSCS0008
/// </summary>
public static class DemoDataSeeder
{
    public const string DemoPin = "1234";

    public const string AdminRollNumber = "L1F21BSCS0001";
    public const string ComputingSocietyRollNumber = "L1F21BSCS0002";
    public const string StudentAffairsRollNumber = "L1F22BSSE0003";
    public const string FirstStudentRollNumber = "L1F23BSCS0004";

    /// <returns>true if data was inserted, false if the database already had users.</returns>
    /// <param name="posterBaseUrl">
    /// Optional base URL serving hackathon.svg, internship.svg and football.svg
    /// (dev/portal/posters, served by the local preview). Without it, demo
    /// notices have no posters.
    /// </param>
    public static async Task<bool> SeedIfEmptyAsync(AppDbContext db, DateTime? nowOverride = null, string? posterBaseUrl = null)
    {
        if (await db.Users.AnyAsync())
        {
            return false;
        }

        var now = nowOverride ?? DateTime.UtcNow;
        var pinHash = PinHasher.Hash(DemoPin);

        User Privileged(string rollNumber, string name, UserRole role, int daysAgo) => new()
        {
            RollNumber = rollNumber,
            Name = name,
            Role = role,
            PinHash = pinHash,
            CreatedAt = now.AddDays(-daysAgo),
            LastSeenAt = now.AddHours(-2),
        };

        var admin = Privileged(AdminRollNumber, "Demo Admin", UserRole.Admin, 60);
        var computingSociety = Privileged(ComputingSocietyRollNumber, "Computing Society", UserRole.Publisher, 45);
        var studentAffairs = Privileged(StudentAffairsRollNumber, "Student Affairs Office", UserRole.Publisher, 40);

        var students = new[] { "Ayesha Khan", "Hamza Ali", "Fatima Noor", "Usman Tariq", "Zainab Ahmed" }
            .Select((name, i) => new User
            {
                RollNumber = $"L1F23BSCS{4 + i:D4}",
                Name = name,
                Role = UserRole.Student,
                CreatedAt = now.AddDays(-30 + i * 3),
                LastSeenAt = now.AddDays(-i),
                ViewCount = 12 - i * 2,
            })
            .ToList();

        db.Users.AddRange(new[] { admin, computingSociety, studentAffairs }.Concat(students));

        var categories = new[] { "Academics", "Careers", "Events", "Societies", "Sports" }
            .ToDictionary(name => name, name => new Category { Name = name, CreatedAt = now.AddDays(-60) });
        db.Categories.AddRange(categories.Values);

        Notice NewNotice(
            User author, string category, string title, string description,
            double createdHoursAgo, double? deadlineInHours = null, string? link = null, int views = 0, string? poster = null) => new()
        {
            ImageUrl = poster is null || string.IsNullOrWhiteSpace(posterBaseUrl) ? null : $"{posterBaseUrl.TrimEnd('/')}/{poster}",
            CreatedByUser = author,
            Category = categories[category],
            Title = title,
            Description = description,
            LinkUrl = link,
            CreatedAt = now.AddHours(-createdHoursAgo),
            UpdatedAt = now.AddHours(-createdHoursAgo),
            Deadline = deadlineInHours is null ? null : now.AddHours(deadlineInHours.Value),
            ViewCount = views,
        };

        var notices = new List<Notice>
        {
            NewNotice(studentAffairs, "Academics", "Mid-term examination schedule released",
                "The mid-term schedule for all undergraduate programs is now available. Check your " +
                "course codes carefully and report any clashes to your department office by Friday.",
                createdHoursAgo: 3, deadlineInHours: 24 * 5, link: "https://example.com/midterm-schedule", views: 214),
            NewNotice(computingSociety, "Events", "Hackathon registrations close tomorrow",
                "Teams of 2-4 can still register for the 24-hour Spring Hackathon. Prizes for the top three " +
                "teams, plus internship interviews with our sponsors.",
                createdHoursAgo: 30, deadlineInHours: 20, link: "https://example.com/hackathon", views: 168, poster: "hackathon.svg"),
            NewNotice(studentAffairs, "Careers", "Internship drive: software engineering roles",
                "Twelve partner companies are hiring summer interns. Bring a printed CV to the career " +
                "centre; sessions run every afternoon this week from 2pm to 5pm. Final-year and " +
                "third-year students are especially encouraged to attend.",
                createdHoursAgo: 50, deadlineInHours: 24 * 10, views: 95, poster: "internship.svg"),
            NewNotice(computingSociety, "Societies", "Computing Society recruitment open",
                "Join the organizing team for workshops, coding contests and industry talks. No prior " +
                "experience needed — just enthusiasm.",
                createdHoursAgo: 72, views: 61),
            NewNotice(studentAffairs, "Academics", "Library hours extended during exams",
                "The main library will stay open until midnight, Monday to Saturday, for the next two weeks.",
                createdHoursAgo: 6, views: 40),
            NewNotice(studentAffairs, "Sports", "Football trials this Saturday",
                "Trials for the university football team will be held at the main ground at 9am. " +
                "Bring your own kit.",
                createdHoursAgo: 24 * 4, views: 33, poster: "football.svg"),

            // Not visible to students — only in the Publisher/Admin
            // management view — so the expiry rules can be seen working.
            NewNotice(studentAffairs, "Academics", "Fee submission deadline",
                "Last date for submitting the semester fee without a late fine.",
                createdHoursAgo: 24 * 6, deadlineInHours: -48, views: 402),
            NewNotice(computingSociety, "Events", "Orientation week welcome session",
                "Welcome session for new students in the main auditorium.",
                createdHoursAgo: 24 * 12, views: 517),
        };
        db.Notices.AddRange(notices);

        // Real like rows (not just a number) so LikeCount stays consistent
        // with what unliking would subtract.
        var likes = new (int Notice, int[] Students)[]
        {
            (0, new[] { 0, 1, 2, 3 }),
            (1, new[] { 0, 2, 4 }),
            (2, new[] { 1, 3 }),
            (3, new[] { 4 }),
        };

        await db.SaveChangesAsync();

        foreach (var (noticeIndex, studentIndexes) in likes)
        {
            var notice = notices[noticeIndex];
            foreach (var studentIndex in studentIndexes)
            {
                db.NoticeLikes.Add(new NoticeLike
                {
                    NoticeId = notice.Id,
                    UserId = students[studentIndex].Id,
                    CreatedAt = notice.CreatedAt.AddHours(1),
                });
            }
            notice.LikeCount = studentIndexes.Length;
        }

        await db.SaveChangesAsync();
        return true;
    }
}
