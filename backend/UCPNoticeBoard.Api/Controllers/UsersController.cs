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
    /// Lets the Admin pre-register a student/publisher by Roll Number before
    /// they ever open the dashboard. If that Roll Number later shows up via
    /// /login, the existing record (and role) is reused instead of creating
    /// a duplicate Student account.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<UserDto>> AddUser([FromBody] AddUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("rollNumber and name are required.");
        }

        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role))
        {
            return BadRequest("role must be Student, Publisher, or Admin.");
        }

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();
        var existing = await _db.Users.FirstOrDefaultAsync(u => u.RollNumber == rollNumber);
        if (existing is not null)
        {
            return Conflict("A user with this Roll Number already exists.");
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            RollNumber = rollNumber,
            Role = role,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Name, user.RollNumber, user.Role.ToString(), user.CreatedAt));
    }

    [HttpPatch("{id}/role")]
    public async Task<ActionResult<UserDto>> UpdateRole(int id, [FromBody] UpdateUserRoleRequest request)
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
        await _db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Name, user.RollNumber, user.Role.ToString(), user.CreatedAt));
    }
}
