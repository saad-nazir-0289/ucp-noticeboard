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
    string? LinkUrl,
    int? CategoryId,
    string? CategoryName,
    DateTime? Deadline,
    int CreatedByUserId,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CreateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline);

public record UpdateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline);

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
