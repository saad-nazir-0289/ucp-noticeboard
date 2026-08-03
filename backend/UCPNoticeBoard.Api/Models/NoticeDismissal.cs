namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// A user "crossing out" a notice only hides it from THEIR OWN feed — it's
/// a personal read-state, not a moderation action. The notice itself is
/// untouched and still visible to everyone else. i like the explanation.
/// </summary>
public class NoticeDismissal
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int NoticeId { get; set; }
    public DateTime DismissedAt { get; set; } = DateTime.UtcNow;
}
