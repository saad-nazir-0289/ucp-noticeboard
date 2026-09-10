namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// One row per device/browser that has opted into push notifications for a
/// given user. A person with both a phone and a laptop registered will have
/// two rows — same UserId, different Endpoint.
/// </summary>
public class PushSubscription
{
    public int Id { get; set; }
    public int UserId { get; set; }

    // These three fields are exactly what the Web Push standard requires
    // to deliver a notification to a specific browser subscription.
    public string Endpoint { get; set; } = string.Empty;
    public string P256dh { get; set; } = string.Empty;
    public string Auth { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Null (the default) means "notify me about everything" — matches
    // the original all-or-nothing behavior exactly. A comma-separated
    // list of Category IDs (e.g. "1,4,7") restricts this device to only
    // those categories. Stored as a plain string rather than a separate
    // join table — there are only ever a handful of categories, so this
    // stays simple without meaningfully limiting anything.
    public string? CategoryFilter { get; set; }
}
