using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("users")]
[Authorize(Roles = "Admin")]
// Every action here checks the acting Admin's PIN, so every action shares
// the same brute-force limit as the other PIN-checked endpoints.
[EnableRateLimiting("pin-check")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPinService _pins;
    private readonly TimeProvider _time;

    public UsersController(AppDbContext db, IPinService pins, TimeProvider time)
    {
        _db = db;
        _pins = pins;
        _time = time;
    }

    public const string AdminPinHeader = "X-Admin-Pin";

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// Every action here that grants or changes privilege now requires
    /// the ACTING ADMIN's own PIN — not the target user's. Without this,
    /// the PIN system protecting notices was trivially bypassable: anyone
    /// who merely knew an Admin's Roll Number could reach Manage Users
    /// (role alone grants that, by design — see AuthController) and
    /// promote an account THEY control to Publisher, which starts with
    /// no PIN set and accepts whatever they type first. This closes that:
    /// creating new privileged access now needs the real Admin's PIN,
    /// same as actually publishing does.
    /// </summary>
    public const string AdminPinMessage = "Your 4-6 digit PIN is required for this action.";

    /// <summary>
    /// Lists every account's name and Roll Number, so it needs the PIN too
    /// — an Admin token alone (which anyone knowing the Admin's Roll Number
    /// can get) must not be enough to read it. Sent as a header since GET
    /// has no body.
    ///
    /// One page at a time (Admins at a whole university shouldn't load
    /// every account at once), optionally filtered by `search`, which
    /// matches part of a Roll Number or a name, case-insensitively.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<UserDto>>> GetUsers(
        [FromHeader(Name = AdminPinHeader)] string? adminPin,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, adminPin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = _db.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            query = query.Where(u => EF.Functions.ILike(u.RollNumber, pattern) || EF.Functions.ILike(u.Name, pattern));
        }

        var total = await query.CountAsync();
        var now = _time.GetUtcNow().UtcDateTime;
        var users = await query
            .OrderBy(u => u.Name)
            .ThenBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new UserDto(
                u.Id, u.Name, u.RollNumber, u.Role.ToString(), u.CreatedAt,
                u.PinLockedUntil != null && u.PinLockedUntil > now,
                _db.DeviceSessions.Count(d => d.UserId == u.Id && d.ExpiresAt > now && d.SecurityStamp == u.SecurityStamp)))
            .ToListAsync();

        return Ok(new PagedResult<UserDto>(users, total, page, pageSize));
    }

    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    /// <summary>So a search for "50%" or "a_b" matches those characters literally.</summary>
    private static string EscapeLike(string value) =>
        value.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_");

    /// <summary>
    /// Adds someone directly as a Publisher — immediate, but now requires
    /// the acting Admin's own PIN. Role alone still shows up for anyone
    /// once granted (that part is unchanged and intentional), but
    /// GRANTING it in the first place is no longer free just from
    /// knowing an Admin's Roll Number.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<UserDto>> AddUser([FromBody] AddUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("rollNumber and name are required.");
        }

        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, request.Pin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.RollNumber == rollNumber);
        if (user is null)
        {
            user = new User
            {
                Name = request.Name.Trim(),
                RollNumber = rollNumber,
                Role = UserRole.Publisher,
                CreatedAt = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString("N")
            };
            _db.Users.Add(user);
        }
        else
        {
            user.Name = request.Name.Trim();
            user.Role = UserRole.Publisher;
            user.SecurityStamp = Guid.NewGuid().ToString("N");
        }

        await _db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Name, user.RollNumber, user.Role.ToString(), user.CreatedAt));
    }

    /// <summary>
    /// Every role change — promotion or demotion — rotates the security
    /// stamp, immediately invalidating any token this account currently
    /// holds. Demoting away from Publisher/Admin also clears their PIN —
    /// if they're ever re-promoted later, they set a fresh one rather
    /// than an old one silently carrying over. Requires the acting
    /// Admin's own PIN, same reasoning as AddUser above.
    /// </summary>
    [HttpPatch("{id}/role")]
    public async Task<ActionResult<UpdateUserRoleResponse>> UpdateRole(int id, [FromBody] UpdateUserRoleRequest request)
    {
        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var newRole))
        {
            return BadRequest("Role must be Student, Publisher, or Admin.");
        }

        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, request.Pin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var user = await _db.Users.FindAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        user.Role = newRole;
        user.SecurityStamp = Guid.NewGuid().ToString("N");

        if (newRole == UserRole.Student)
        {
            _pins.ClearPin(user);
        }

        await _db.SaveChangesAsync();
        // The stamp rotation above already invalidates them; this removes the rows.
        await _pins.RevokeDevicesAsync(user.Id);

        return Ok(new UpdateUserRoleResponse(user.Id, user.Name, user.RollNumber, user.Role.ToString(), user.CreatedAt));
    }

    /// <summary>
    /// For when a Publisher/Admin genuinely forgets their OWN PIN —
    /// clears it so their next notice action prompts for a new one.
    /// Still requires the ACTING Admin's own PIN (they're proving they're
    /// really the Admin, not just someone who reached this page because
    /// role visibility alone got them here).
    /// </summary>
    [HttpPost("{id}/reset-pin")]
    public async Task<IActionResult> ResetPin(int id, [FromQuery] string? adminPin)
    {
        if (id == CurrentUserId)
        {
            return BadRequest(
                "You can't reset your own PIN this way. Use the Admin activation link " +
                "(the same one that grants Admin access) to reset it instead — that's the " +
                "only path for your own PIN, so there's exactly one way to touch it, and " +
                "it requires the real secret, not just your current PIN.");
        }

        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, adminPin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var user = await _db.Users.FindAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        // Also the way to lift a lockout, and a reset is often because a
        // device or PIN leaked, so every unlocked device is logged out too.
        _pins.ClearPin(user);
        await _db.SaveChangesAsync();
        await _pins.RevokeDevicesAsync(user.Id);

        return NoContent();
    }

    /// <summary>
    /// Logs every unlocked device of this user out (e.g. a society member
    /// left, or lost their phone), without touching their PIN.
    /// </summary>
    [HttpDelete("{id}/devices")]
    public async Task<IActionResult> RevokeDevices(int id, [FromHeader(Name = AdminPinHeader)] string? adminPin)
    {
        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, adminPin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        if (!await _db.Users.AnyAsync(u => u.Id == id)) return NotFound();

        await _pins.RevokeDevicesAsync(id);
        return NoContent();
    }

    /// <summary>
    /// The only way a name can change after account creation, now that
    /// /login no longer trusts a client-supplied name for existing users.
    /// Requires the acting Admin's PIN: renaming a Publisher changes who
    /// students see a notice as coming from.
    /// </summary>
    [HttpPatch("{id}/name")]
    public async Task<ActionResult<UserDto>> UpdateName(int id, [FromBody] UpdateUserNameRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("name is required.");
        }

        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(admin, request.Pin, AdminPinMessage);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var user = await _db.Users.FindAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        user.Name = request.Name.Trim();
        await _db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Name, user.RollNumber, user.Role.ToString(), user.CreatedAt));
    }
}
