namespace UCPNoticeBoard.Api.Tests.Infrastructure;

/// <summary>
/// A clock tests can move forward, so lockouts and device expiry can be
/// tested without waiting. Replaces TimeProvider.System in the test app.
/// </summary>
public class TestClock : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
