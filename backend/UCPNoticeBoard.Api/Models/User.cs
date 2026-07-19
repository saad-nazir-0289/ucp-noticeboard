namespace UCPNoticeBoard.Api.Models;

public enum UserRole
{
    Student = 0,
    Publisher = 1,
    Admin = 2
}

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RollNumber { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Student;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAt { get; set; }
    public int ViewCount { get; set; } = 0;

    public ICollection<Notice> Notices { get; set; } = new List<Notice>();
}
