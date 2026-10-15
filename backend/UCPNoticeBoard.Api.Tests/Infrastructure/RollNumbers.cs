namespace UCPNoticeBoard.Api.Tests.Infrastructure;

/// <summary>Unique, correctly formatted Roll Numbers (e.g. L1F21BSCS000042).</summary>
public static class RollNumbers
{
    private static int _counter;

    public static string Next() => $"L1F21BSCS{Interlocked.Increment(ref _counter):D6}";
}
