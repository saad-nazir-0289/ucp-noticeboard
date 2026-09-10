namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// A simple, public like — anyone can see the count, everyone's own
/// like/unlike is theirs to toggle. Unlike a dismissal, this doesn't hide
/// anything from anyone; it's purely a positive signal, same as any
/// "like" feature elsewhere.
/// </summary>
public class NoticeLike
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int NoticeId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
