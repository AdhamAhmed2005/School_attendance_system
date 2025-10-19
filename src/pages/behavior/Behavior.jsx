import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";

function Behavior() {
  return (
    <TabsContent value="/behavior" className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>إدارة السلوك</CardTitle>
          <CardDescription>تسجيل وإدارة سلوكيات الطالبات</CardDescription>
        </CardHeader>
      </Card>
    </TabsContent>
  );
}

export default Behavior;
