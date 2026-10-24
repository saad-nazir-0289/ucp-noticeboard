namespace UCPNoticeBoard.Api.Models;

public class Notice
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public string? LinkUrl { get; set; }
    public int? CategoryId { get; set; }
    public DateTime? Deadline { get; set; }
    public int CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Incremented every time GET /notices/{id} is called — a raw
    // open-count, not unique-viewer tracking (the same person reopening
    // it counts again). That's intentional: this exists to give the
    // Admin a simple "people are actually looking at this" signal, not
    // analytics-grade measurement. Only the Admin ever sees it.
    public int ViewCount { get; set; } = 0;

    // Set once a 24-hour-before-deadline reminder push has gone out for
    // this notice, so the background reminder job never sends it twice.
    // Meaningless for notices with no Deadline.
    public bool ReminderSent { get; set; } = false;

    // Ticked by the publisher: send a "last call" push about an hour
    // before the deadline. Off unless they ask for it.
    public bool SendLastCall { get; set; } = false;

    // Set once that last call has gone out. Like ReminderSent, cleared when
    // the deadline is changed.
    public bool LastCallSent { get; set; } = false;

    // Set by the Admin only. Pinned notices sit above everything else in
    // every feed, and one without a deadline doesn't expire after the
    // usual 7 days — it stays until it's unpinned (or its deadline passes).
    public bool IsPinned { get; set; } = false;

    // Deleting a notice moves it to the bin rather than erasing it: hidden
    // everywhere (see the query filter in AppDbContext), restorable for
    // BinRetention, then removed for good by NoticeBinService.
    public DateTime? DeletedAt { get; set; }
    public int? DeletedByUserId { get; set; }

    public User? CreatedByUser { get; set; }
    public Category? Category { get; set; }
}
