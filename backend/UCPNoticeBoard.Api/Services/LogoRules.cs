namespace UCPNoticeBoard.Api.Services;

/// <summary>What a publisher logo URL may be.</summary>
public static class LogoRules
{
    public const int MaxLength = 2000;

    /// <summary>
    /// Empty clears the logo; anything else must be an absolute https URL,
    /// since it's loaded on every student's screen next to the notice.
    /// </summary>
    public static bool TryNormalize(string? input, out string? logoUrl, out string? problem)
    {
        logoUrl = null;
        problem = null;
        if (string.IsNullOrWhiteSpace(input)) return true;

        var trimmed = input.Trim();
        if (trimmed.Length > MaxLength
            || !Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps)
        {
            problem = "The logo must be an https image link.";
            return false;
        }

        logoUrl = trimmed;
        return true;
    }
}
