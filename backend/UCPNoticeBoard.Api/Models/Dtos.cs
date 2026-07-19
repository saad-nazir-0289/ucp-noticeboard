namespace UCPNoticeBoard.Api.Models;

public record LoginRequest(string RollNumber, string Name);

public record LoginResponse(int Id, string Name, string RollNumber, string Role, string Token);

public record UserDto(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserRoleRequest(string Role);

public record AddUserRequest(string RollNumber, string Name, string Role);

public record NoticeDto(
    int Id,
    string Title,
    string Description,
    string? ImageUrl,
    int CreatedByUserId,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateNoticeRequest(string Title, string Description, string? ImageUrl);

public record UpdateNoticeRequest(string Title, string Description, string? ImageUrl);

public record AnalyticsSummaryDto(
    int TotalUsers,
    int TotalStudents,
    int TotalPublishers,
    int TotalAdmins,
    int TotalViews,
    int ActiveLast7Days
);
