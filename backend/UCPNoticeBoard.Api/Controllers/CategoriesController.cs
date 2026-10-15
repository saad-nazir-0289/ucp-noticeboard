using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

/// <summary>
/// Read-only: the categories are a fixed list (CategoryCatalog), so there
/// is deliberately no way to add one.
/// </summary>
[ApiController]
[Route("categories")]
[Authorize]
public class CategoriesController : ControllerBase
{
    private readonly INoticeQueryService _noticeQuery;

    public CategoriesController(INoticeQueryService noticeQuery)
    {
        _noticeQuery = noticeQuery;
    }

    [HttpGet]
    public async Task<ActionResult<List<CategoryDto>>> GetCategories()
    {
        return Ok(await _noticeQuery.GetCategoriesAsync());
    }
}
