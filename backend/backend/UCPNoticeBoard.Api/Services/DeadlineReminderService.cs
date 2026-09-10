using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Runs continuously alongside the API in the same process — no separate
/// worker, no external scheduler, no added cost. This is the first thing
/// in the project that runs on a timer rather than in response to a
/// request, which is worth knowing if this is ever scaled to multiple
/// backend instances: with more than one instance, each would run this
/// loop independently and could send duplicate reminders. Harmless at
/// today's single-instance scale, but not something to forget about if
/// that ever changes — the fix at that point would be moving this to a
/// single dedicated worker rather than running it in every instance.
/// </summary>
public class DeadlineReminderService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ReminderWindow = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DeadlineReminderService> _logger;

    public DeadlineReminderService(IServiceScopeFactory scopeFactory, ILogger<DeadlineReminderService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // A short initial delay so this doesn't compete with the app's
        // own startup (migrations, etc.) for the first few seconds.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SendDueRemindersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                // A failure here should never crash the whole background
                // service — just log it and try again on the next tick.
                _logger.LogError(ex, "Deadline reminder check failed.");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }

    private async Task SendDueRemindersAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pushService = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();

        var now = DateTime.UtcNow;
        var windowEnd = now + ReminderWindow;

        // Notices whose deadline falls within the next 24 hours, haven't
        // already been reminded about, and haven't passed yet (a deadline
        // that's already gone doesn't need a "24 hours left" push).
        var dueNotices = await db.Notices
            .Where(n => n.Deadline != null
                        && n.Deadline > now
                        && n.Deadline <= windowEnd
                        && !n.ReminderSent)
            .ToListAsync(cancellationToken);

        foreach (var notice in dueNotices)
        {
            try
            {
                await pushService.NotifyAllAsync(
                    $"Deadline soon: {notice.Title}",
                    "Less than 24 hours left.",
                    imageUrl: notice.ImageUrl,
                    categoryId: notice.CategoryId
                );

                notice.ReminderSent = true;
            }
            catch (Exception ex)
            {
                // Leave ReminderSent false on failure so this notice gets
                // retried on the next tick rather than silently skipped.
                _logger.LogWarning(ex, "Failed to send deadline reminder for notice {Id}", notice.Id);
            }
        }

        if (dueNotices.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
