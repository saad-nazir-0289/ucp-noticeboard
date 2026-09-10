using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    public partial class AddSecurityStamp : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "PendingActivationCode",
                table: "Users",
                newName: "PrivilegedCredential");

            migrationBuilder.AddColumn<string>(
                name: "SecurityStamp",
                table: "Users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            // Any account promoted under the OLD one-time-code system has
            // PrivilegedCredential = null right now (it was cleared after
            // first use, back when that was correct behavior). Left as-is,
            // that account would be silently downgraded to Student on its
            // next login with NO self-service way back — worse, for an
            // existing Admin specifically, the bootstrap link refuses to
            // fire again once "an Admin already exists," and their own
            // now-locked-out row still counts as one, blocking their own
            // way back in.
            //
            // Resetting these accounts to Student here closes that trap:
            // it makes the Admin bootstrap link work again exactly as it
            // did the very first time (no Admin exists once this runs),
            // and any pre-existing Publisher just needs a normal
            // re-promotion through Manage Users afterward, same as
            // documented for anyone else.
            migrationBuilder.Sql(
                "UPDATE \"Users\" SET \"Role\" = 'Student' " +
                "WHERE \"Role\" IN ('Publisher', 'Admin') AND \"PrivilegedCredential\" IS NULL;"
            );
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "SecurityStamp", table: "Users");

            migrationBuilder.RenameColumn(
                name: "PrivilegedCredential",
                table: "Users",
                newName: "PendingActivationCode");
        }
    }
}
