namespace UCPNoticeBoard.Api.Models;

public record LoginRequest(string RollNumber, string Name, string? ActivationCode);

public record LoginResponse(int Id, string Name, string RollNumber, string Role, string Token);

public record UserDto(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserRoleRequest(string Role);

public record AddUserRequest(string RollNumber, string Name);

// Returned once, at the moment a Publisher is added — never re-exposed
// afterward. The Admin is expected to relay the activation link
// out-of-band (WhatsApp, in person, etc.), not through the guessable
// Roll Number channel.
public record AddUserResponse(int Id, string Name, string RollNumber, string Role, string ActivationCode);

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
