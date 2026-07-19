using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// --- Railway (and most PaaS hosts) assign a dynamic port via $PORT and
// expect the app to bind to 0.0.0.0. Locally, PORT is unset, so this falls
// back to whatever's in launchSettings.json / appsettings.json as usual. ---
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

// --- Database ---
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// --- Services ---
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

// --- Auth ---
var jwtSettings = builder.Configuration.GetSection("Jwt");
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!))
        };
    });

builder.Services.AddAuthorization();

// --- CORS: the extension's content script runs in the page origin, so we
// allow the UCP portal origin plus the extension's own runtime origin. ---
builder.Services.AddCors(options =>
{
    options.AddPolicy("Extension", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true) // extension content scripts don't send a browser-restricted Origin
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// CORS goes FIRST, before anything else — including the exception handler
// below. This guarantees every response, even a crash/error response, gets
// the CORS header attached. Without this ordering, a server-side crash can
// show up in the browser as a confusing "blocked by CORS policy" message
// instead of the real error, because the crashed response never got as far
// as the CORS middleware.
app.UseCors("Extension");

// Turns any unhandled exception into a readable JSON error instead of a
// raw connection failure. This is what lets you actually SEE what broke
// (open the failed request in Chrome's Network tab → Response) instead of
// just seeing "500" with no explanation.
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        var message = feature?.Error?.Message ?? "An unexpected error occurred.";
        await context.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error = message }));
    });
});

// Swagger stays on in every environment on purpose (not just Development).
// It's just API documentation — nothing sensitive — and having it always
// available is what makes it possible to quickly check "did my deployment
// actually work?" by visiting /swagger.
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
