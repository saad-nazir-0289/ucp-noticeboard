namespace UCPNoticeBoard.Api.Models;

public record LoginRequest(string RollNumber, string Name, string? ActivationCode);

public record LoginResponse(
    int Id,
    string Name,
    string RollNumber,
    string Role,
    string Token,
    List<NoticeDto> Notices,
    List<CategoryDto> Categories
);

public record UserDto(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserRoleRequest(string Role);

public record UpdateUserRoleResponse(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserNameRequest(string Name);

public record AddUserRequest(string RollNumber, string Name);

public record NoticeDto(
    int Id,
    string Title,
    string Description,
    string? ImageUrl,
    string? LinkUrl,
    int? CategoryId,
    string? CategoryName,
    DateTime? Deadline,
    int CreatedByUserId,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

// Pin is required for every notice-mutating action. If the account has no
// PinHash set yet, whatever is supplied here becomes their PIN going
// forward (first-use-sets-it) — otherwise it must match exactly.
public record CreateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string Pin);

public record UpdateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string Pin);

public record CategoryDto(int Id, string Name);

public record CreateCategoryRequest(string Name);

public record AnalyticsSummaryDto(
    int TotalUsers,
    int TotalStudents,
    int TotalPublishers,
    int TotalAdmins,
    int TotalViews,
    int ActiveLast7Days
);

public record PushSubscribeRequest(string Endpoint, string P256dh, string Auth);

public record VapidPublicKeyResponse(string PublicKey);
