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
[Route("categories")]
[Authorize]
public class CategoriesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly INoticeQueryService _noticeQuery;

    public CategoriesController(AppDbContext db, INoticeQueryService noticeQuery)
    {
        _db = db;
        _noticeQuery = noticeQuery;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    [HttpGet]
    public async Task<ActionResult<List<CategoryDto>>> GetCategories()
    {
        return Ok(await _noticeQuery.GetCategoriesAsync());
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<CategoryDto>> CreateCategory([FromBody] CreateCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("name is required.");
        }

        var admin = await _db.Users.FindAsync(CurrentUserId);
        if (admin is null) return Unauthorized();

        var pinError = PinHasher.VerifyOrSet(admin, request.Pin, "Your 4-6 digit PIN is required for this action.");
        if (pinError is not null)
        {
            return BadRequest(pinError);
        }

        var name = request.Name.Trim();
        var exists = await _db.Categories.AnyAsync(c => c.Name.ToLower() == name.ToLower());
        if (exists)
        {
            return Conflict("A category with this name already exists.");
        }

        var category = new Category { Name = name, CreatedAt = DateTime.UtcNow };
        _db.Categories.Add(category);
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateCategoriesCache();

        return Ok(new CategoryDto(category.Id, category.Name));
    }
}
