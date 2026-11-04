namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// One number for one day, for the Admin's Analytics: how many times the
/// dashboard or app was opened ("visits"), by how many people ("visitors"),
/// how many notices were opened ("opens"), and opens by hour of the day
/// ("hour.13"). Only totals: nothing here says who did what.
/// Days are Pakistan days (UTC+5).
/// </summary>
public class DailyCount
{
    public DateOnly Day { get; set; }
    public string Metric { get; set; } = string.Empty;
    public int Count { get; set; }
}
