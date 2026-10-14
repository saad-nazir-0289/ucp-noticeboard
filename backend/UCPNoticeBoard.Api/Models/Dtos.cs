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

public record UpdateUserRoleRequest(string Role, string Pin);

public record UpdateUserRoleResponse(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserNameRequest(string Name, string? Pin);

public record AddUserRequest(string RollNumber, string Name, string Pin);

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
    DateTime UpdatedAt,
    int ViewCount,
    int LikeCount,
    // Whether the CURRENT requesting user has liked this — never baked
    // into the shared notices cache (that's shared across every user),
    // always overlaid per-request afterward. See NoticeQueryService.
    bool LikedByMe
);

// Pin is required for every notice-mutating action. If the account has no
// PinHash set yet, whatever is supplied here becomes their PIN going
// forward (first-use-sets-it) — otherwise it must match exactly.
public record CreateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string Pin);

public record UpdateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string Pin);

public record CategoryDto(int Id, string Name);

public record CreateCategoryRequest(string Name, string? Pin);

public record AnalyticsSummaryDto(
    int TotalUsers,
    int TotalStudents,
    int TotalPublishers,
    int TotalAdmins,
    int TotalViews,
    int ActiveLast7Days
);

public record PushSubscribeRequest(string Endpoint, string P256dh, string Auth);

// An empty list means "notify me about everything" — same as never
// having set a filter at all. A non-empty list restricts this device to
// only those categories.
public record UpdatePushCategoriesRequest(string Endpoint, List<int> CategoryIds);

public record VapidPublicKeyResponse(string PublicKey);
