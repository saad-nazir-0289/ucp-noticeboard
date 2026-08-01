namespace UCPNoticeBoard.Api.Models;

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Notice> Notices { get; set; } = new List<Notice>();
}
