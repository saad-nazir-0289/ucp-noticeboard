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
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db)
    {
        _db = db;
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
    /// Adds someone directly as a Publisher — immediately, no activation
    /// link to relay. This is safe because role visibility alone no
    /// longer grants anything dangerous: the actual gate is the PIN they
    /// set the first time they create a notice.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<UserDto>> AddUser([FromBody] AddUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("rollNumber and name are required.");
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
    /// than an old one silently carrying over.
    /// </summary>
    [HttpPatch("{id}/role")]
    public async Task<ActionResult<UpdateUserRoleResponse>> UpdateRole(int id, [FromBody] UpdateUserRoleRequest request)
    {
        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var newRole))
        {
            return BadRequest("Role must be Student, Publisher, or Admin.");
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
    /// For when a Publisher/Admin genuinely forgets their PIN — clears it
    /// so their next notice action prompts them to set a new one, same as
    /// a first-time Publisher. Doesn't touch their role at all.
    /// </summary>
    [HttpPost("{id}/reset-pin")]
    public async Task<IActionResult> ResetPin(int id)
    {
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
    /// Admin-only and authenticated, unlike /login.
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
