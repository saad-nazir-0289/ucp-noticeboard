using System.Security.Cryptography;
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
    /// Generates a one-time activation code for this Roll Number. The
    /// Roll Number alone does NOT grant Publisher access — that only
    /// happens when this exact code is redeemed (via a link containing it
    /// that you share with that person directly). If they already have an
    /// account (e.g. they've opened the dashboard before as a Student),
    /// their existing account is reused rather than erroring out — this is
    /// the common case, not the exception.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<AddUserResponse>> AddUser([FromBody] AddUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("rollNumber and name are required.");
        }

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();
        var code = RandomNumberGenerator.GetHexString(20);

        var user = await _db.Users.FirstOrDefaultAsync(u => u.RollNumber == rollNumber);
        if (user is null)
        {
            user = new User
            {
                Name = request.Name.Trim(),
                RollNumber = rollNumber,
                Role = UserRole.Student,
                CreatedAt = DateTime.UtcNow,
                PendingActivationCode = code
            };
            _db.Users.Add(user);
        }
        else
        {
            user.Name = request.Name.Trim();
            user.PendingActivationCode = code;
        }

        await _db.SaveChangesAsync();

        return Ok(new AddUserResponse(user.Id, user.Name, user.RollNumber, user.Role.ToString(), code));
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
