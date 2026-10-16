using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Controllers;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Empties the bin: notices deleted more than NoticesController.BinRetention
/// ago are removed for good, a few times a day. Until then they can be
/// restored (POST /notices/{id}/restore).
/// </summary>
public class NoticeBinService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(6);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NoticeBinService> _logger;

    public NoticeBinService(IServiceScopeFactory scopeFactory, ILogger<NoticeBinService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var cutoff = DateTime.UtcNow - NoticesController.BinRetention;
                var removed = await db.Notices
                    .IgnoreQueryFilters()
                    .Where(n => n.DeletedAt != null && n.DeletedAt < cutoff)
                    .ExecuteDeleteAsync(stoppingToken);
                if (removed > 0) _logger.LogInformation("Emptied {Count} notice(s) from the bin.", removed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Emptying the notice bin failed.");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }
}
