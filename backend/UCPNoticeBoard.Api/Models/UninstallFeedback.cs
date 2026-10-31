namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// One answer to "What made you remove NoticeBoard?", from the page Chrome
/// opens when the extension is uninstalled. Anonymous on purpose: no user,
/// Roll Number or IP address is stored, only the answer itself.
/// </summary>
public class UninstallFeedback
{
    public int Id { get; set; }

    /// <summary>One of <see cref="Reasons"/>.</summary>
    public string Reason { get; set; } = string.Empty;

    /// <summary>Optional, in their own words (up to <see cref="CommentMaxLength"/> characters).</summary>
    public string? Comment { get; set; }

    /// <summary>The extension version that was removed, e.g. "1.22.0".</summary>
    public string? ExtensionVersion { get; set; }

    public DateTime CreatedAt { get; set; }

    public const int CommentMaxLength = 500;

    /// <summary>The answers the page offers, as stored.</summary>
    public static readonly string[] Reasons = { "not-useful", "slow", "errors", "phone-app", "cluttered", "other" };
}
