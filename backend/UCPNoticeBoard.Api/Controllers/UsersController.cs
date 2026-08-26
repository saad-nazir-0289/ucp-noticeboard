using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("users")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private static readonly Regex PinFormat = new(@"^\d{4,6}$", RegexOptions.Compiled);

    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    private static string HashPin(string pin) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin)));

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
    private static string? VerifyOrSetAdminPin(User admin, string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin) || !PinFormat.IsMatch(pin))
        {
            return "Your 4-6 digit PIN is required for this action.";
        }

        var hash = HashPin(pin);

        if (admin.PinHash is null)
        {
            admin.PinHash = hash;
            return null;
        }

        return admin.PinHash == hash ? null : "Incorrect PIN.";
    }

    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> GetUsers()
    {
        var users = await _db.Users
            .OrderBy(u => u.Name)
            .Select(u => new UserDto(u.Id, u.Name, u.RollNumber, u.Role.ToString(), u.CreatedAt))
            .ToListAsync();

        return Ok(users);
    }

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

        var pinError = VerifyOrSetAdminPin(admin, request.Pin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

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

        var pinError = VerifyOrSetAdminPin(admin, request.Pin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

        var user = await _db.Users.FindAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        user.Role = newRole;
        user.SecurityStamp = Guid.NewGuid().ToString("N");

        if (newRole == UserRole.Student)
        {
            user.PinHash = null;
        }

        await _db.SaveChangesAsync();

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
    public async Task<IActionResult> ResetPin(int id, [FromQuery] string adminPin)
    {
        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinError = VerifyOrSetAdminPin(admin, adminPin);
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

        var user = await _db.Users.FindAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        user.PinHash = null;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// The only way a name can change after account creation, now that
    /// /login no longer trusts a client-supplied name for existing users.
    /// Admin-only and authenticated, unlike /login. Doesn't touch notice
    /// publishing rights, so no PIN needed here.
    /// </summary>
    [HttpPatch("{id}/name")]
    public async Task<ActionResult<UserDto>> UpdateName(int id, [FromBody] UpdateUserNameRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("name is required.");
        }

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
