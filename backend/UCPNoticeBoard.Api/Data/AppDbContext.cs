using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Notice> Notices => Set<Notice>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<NoticeDismissal> NoticeDismissals => Set<NoticeDismissal>();
    public DbSet<NoticeLike> NoticeLikes => Set<NoticeLike>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<DeviceSession> DeviceSessions => Set<DeviceSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.RollNumber).IsUnique();
            entity.Property(u => u.Name).IsRequired().HasMaxLength(200);
            entity.Property(u => u.RollNumber).IsRequired().HasMaxLength(40);
            entity.Property(u => u.Role).HasConversion<string>().HasMaxLength(20);
            entity.Property(u => u.PrivilegedCredential).HasMaxLength(40);
            entity.Property(u => u.SecurityStamp).HasMaxLength(64);
            // Room for the salted PBKDF2 format ("pbkdf2-sha256$iterations$salt$hash"),
            // not just the old 64-character unsalted SHA-256 hex.
            entity.Property(u => u.PinHash).HasMaxLength(200);
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasIndex(c => c.Name).IsUnique();
            entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<Notice>(entity =>
        {
            entity.Property(n => n.Title).IsRequired().HasMaxLength(200);
            entity.Property(n => n.Description).IsRequired().HasMaxLength(4000);
            entity.Property(n => n.ImageUrl).HasMaxLength(1000);
            entity.Property(n => n.LinkUrl).HasMaxLength(1000);

            entity.HasOne(n => n.CreatedByUser)
                  .WithMany(u => u.Notices)
                  .HasForeignKey(n => n.CreatedByUserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(n => n.Category)
                  .WithMany(c => c.Notices)
                  .HasForeignKey(n => n.CategoryId)
                  .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(n => n.CreatedAt);
        });

        modelBuilder.Entity<NoticeDismissal>(entity =>
        {
            entity.HasIndex(d => new { d.UserId, d.NoticeId }).IsUnique();
        });

        modelBuilder.Entity<NoticeLike>(entity =>
        {
            entity.HasIndex(l => new { l.UserId, l.NoticeId }).IsUnique();
        });

        modelBuilder.Entity<PushSubscription>(entity =>
        {
            entity.Property(p => p.Endpoint).IsRequired().HasMaxLength(2000);
            entity.Property(p => p.P256dh).IsRequired().HasMaxLength(500);
            entity.Property(p => p.Auth).IsRequired().HasMaxLength(500);
            entity.Property(p => p.CategoryFilter).HasMaxLength(200);
            // A given browser subscription (endpoint) should only ever map
            // to one row — re-subscribing with the same endpoint updates
            // it rather than creating a duplicate.
            entity.HasIndex(p => p.Endpoint).IsUnique();
            entity.HasIndex(p => p.UserId);
        });

        modelBuilder.Entity<DeviceSession>(entity =>
        {
            entity.Property(d => d.TokenHash).IsRequired().HasMaxLength(64);
            entity.Property(d => d.SecurityStamp).IsRequired().HasMaxLength(64);
            entity.Property(d => d.Label).IsRequired().HasMaxLength(200);
            entity.HasIndex(d => d.TokenHash).IsUnique();
            entity.HasIndex(d => d.UserId);
            entity.HasOne(d => d.User).WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
