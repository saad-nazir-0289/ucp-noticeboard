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

// PinLocked / ActiveDevices are only filled in by the Admin user list.
public record UserDto(
    int Id,
    string Name,
    string RollNumber,
    string Role,
    DateTime CreatedAt,
    bool PinLocked = false,
    int ActiveDevices = 0
);

/// <summary>One page of a longer list, with the total so clients can page through it.</summary>
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize);

public record UnlockDeviceRequest(string? Pin, string? Label);

public record UnlockDeviceResponse(string DeviceToken, int DeviceId, DateTime ExpiresAt);

public record DeviceSessionDto(int Id, string Label, DateTime CreatedAt, DateTime LastUsedAt, bool IsCurrent);

public record UpdateUserRoleRequest(string Role, string? Pin);

public record UpdateUserRoleResponse(int Id, string Name, string RollNumber, string Role, DateTime CreatedAt);

public record UpdateUserNameRequest(string Name, string? Pin);

public record AddUserRequest(string RollNumber, string Name, string? Pin);

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
    // Admin only — null for everyone else (NoticeQueryService.ForViewer).
    int? ViewCount,
    bool IsPinned
);

// Pin is required for every notice-mutating action unless the request
// comes from an unlocked device (X-Device-Token, see PinService). If the
// account has no PIN yet, whatever is supplied here becomes their PIN
// going forward (first-use-sets-it) — otherwise it must match exactly.
// IsPinned is only honoured for the Admin; null leaves it unchanged on update.
public record CreateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string? Pin, bool? IsPinned = null);

public record UpdateNoticeRequest(string Title, string Description, string? ImageUrl, string? LinkUrl, int? CategoryId, DateTime? Deadline, string? Pin, bool? IsPinned = null);

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
